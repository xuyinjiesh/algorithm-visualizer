import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, stat, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instrument } from './instrument.mjs';
import { wrapLeetCode } from './leetcode.mjs';
import { explainWatchErrors } from './watch-diagnostics.mjs';
import { parseTrace, LIMITS } from '../src/trace.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const jobsRoot = path.join(root, 'build', 'runs');
let compilerPromise;

export class RunError extends Error {
  constructor(message, phase, details = {}) { super(message); this.phase = phase; Object.assign(this, details); }
}

function terminate(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    // Some restricted Windows environments start taskkill but reject its operation.
    // A nonzero exit must fall back just like failure to spawn it.
    const fallback = () => { try { child.kill('SIGKILL'); } catch { /* Already exited. */ } };
    killer.on('error', fallback);
    killer.on('close', code => { if (code !== 0) fallback(); });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

function decode(bytes, fallbackEncoding) {
  if (fallbackEncoding) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder(fallbackEncoding).decode(bytes); }
  }
  return bytes.toString('utf8');
}

export function execute(command, args, { cwd = root, env = process.env, stdin = '', timeout = 30000, signal, limit = 1024 * 1024, fallbackEncoding } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new RunError('运行已停止', 'cancelled')); return; }
    const child = spawn(command, args, { cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = { stdout: [], stderr: [] };
    let bytes = 0, reason, settled = false;
    const stop = message => { if (!reason) { reason = message; terminate(child); } };
    const timeoutId = setTimeout(() => stop('执行超时'), timeout);
    const aborted = () => stop('运行已停止');
    signal?.addEventListener('abort', aborted, { once: true });
    function finish(error, code) {
      if (settled) return; settled = true;
      clearTimeout(timeoutId); signal?.removeEventListener('abort', aborted);
      const output = { code, stdout: decode(Buffer.concat(chunks.stdout), fallbackEncoding), stderr: decode(Buffer.concat(chunks.stderr), fallbackEncoding) };
      if (error) reject(error); else if (reason) reject(new RunError(reason, reason === '运行已停止' ? 'cancelled' : 'process', output)); else resolve(output);
    }
    for (const channel of ['stdout', 'stderr']) child[channel].on('data', chunk => {
      bytes += chunk.length;
      if (bytes <= limit) chunks[channel].push(chunk);
      else stop('程序输出超过 1 MB 限制');
    });
    child.on('error', error => finish(error));
    child.on('close', code => finish(null, code));
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

async function findCompiler() {
  for (const compiler of process.env.CXX ? [process.env.CXX] : ['g++', 'clang++']) {
    try {
      if ((await execute(compiler, ['--version'], { timeout: 5000 })).code === 0) return { name: compiler, command: compiler, env: process.env, msvc: false };
    } catch { /* Try the next installed toolchain. */ }
  }
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
    const vswhere = path.join(programFiles, 'Microsoft Visual Studio/Installer/vswhere.exe');
    let install = path.join(programFiles, 'Microsoft Visual Studio/2022/BuildTools');
    try {
      const found = await execute(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { timeout: 5000 });
      if (found.stdout.trim()) install = found.stdout.trim();
    } catch { /* Check the standard installation path. */ }
    const setup = path.join(install, 'VC/Auxiliary/Build/vcvars64.bat');
    try {
      await access(setup);
      const codePage = (await execute('cmd.exe', ['/d', '/c', 'chcp'])).stdout.match(/\d+/)?.[0];
      const encoding = { 65001: 'utf-8', 936: 'gb18030', 950: 'big5', 932: 'shift_jis', 949: 'euc-kr', 1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258' }[codePage] || 'windows-1252';
      await mkdir(path.join(root, 'build'), { recursive: true });
      await writeFile(path.join(root, 'build', 'editor-env.cmd'), ['@echo off', `call "${setup}" >nul`, 'if errorlevel 1 exit /b 1', 'set PATH', 'set INCLUDE', 'set LIB'].join('\r\n'));
      const result = await execute('cmd.exe', ['/d', '/c', 'build\\editor-env.cmd'], { fallbackEncoding: encoding });
      if (result.code !== 0) throw new Error('MSVC environment setup failed');
      const env = { ...process.env };
      for (const line of result.stdout.split(/\r?\n/)) {
        const match = /^(Path|INCLUDE|LIB|LIBPATH)=(.*)$/i.exec(line);
        if (!match) continue;
        for (const key of Object.keys(env)) if (key.toLowerCase() === match[1].toLowerCase()) delete env[key];
        env[match[1]] = match[2];
      }
      // /utf-8 controls source and execution strings, not localized diagnostics.
      return { name: 'MSVC / C++17', command: 'cl.exe', env, msvc: true, encoding };
    } catch { /* Report a usable compiler setup message below. */ }
  }
  throw new RunError('未找到 C++17 编译器。请安装 GCC、Clang 或 Visual Studio C++ Build Tools，然后重新启动服务。', 'compiler');
}

function getCompiler() {
  if (!compilerPromise) compilerPromise = findCompiler().catch(error => { compilerPromise = undefined; throw error; });
  return compilerPromise;
}

export async function runCode({ source, watches, stdin = '', execution, timeoutMs = 5000 }, signal) {
  let generated;
  try {
    generated = wrapLeetCode(instrument(source, watches), execution, source);
    if (typeof stdin !== 'string' || Buffer.byteLength(stdin) > 65536) throw new Error('标准输入不能超过 64 KB');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) throw new Error('运行时限需在 100–10000 ms 之间');
  } catch (error) { throw new RunError(error.message, 'validation'); }
  const started = Date.now();
  const compiler = await getCompiler();
  if (signal?.aborted) throw new RunError('运行已停止', 'cancelled');
  await mkdir(jobsRoot, { recursive: true });
  const job = await mkdtemp(path.join(jobsRoot, 'run-'));
  let phase = 'compile';
  try {
    await writeFile(path.join(job, 'main.cpp'), source, 'utf8');
    await writeFile(path.join(job, 'program.cpp'), generated, 'utf8');
    const executable = process.platform === 'win32' ? 'program.exe' : 'program';
    const args = compiler.msvc
      ? ['/nologo', '/std:c++17', '/EHsc', '/utf-8', '/W3', `/I${path.join(root, 'include')}`, 'program.cpp', `/Fe:${executable}`, '/Fo:program.obj']
      : ['-std=c++17', '-O0', '-g', '-I', path.join(root, 'include'), 'program.cpp', '-o', executable];
    const compiled = await execute(compiler.command, args, { cwd: job, env: compiler.env, timeout: 30000, signal, fallbackEncoding: compiler.encoding });
    if (compiled.code !== 0) {
      const diagnostics = compiled.stdout + compiled.stderr;
      const explanations = explainWatchErrors(diagnostics, watches);
      throw new RunError(explanations.length ? `观察配置编译失败。${explanations.join('\n')} 请点击对应变量的“编辑”修正配置。` : '编译失败，请检查源码及观察变量配置', 'compile', { diagnostics });
    }
    phase = 'run';
    const result = await execute(path.join(job, executable), [], { cwd: job, stdin, timeout: timeoutMs, signal });
    if (result.code !== 0) throw new RunError(`程序退出，返回码 ${result.code}`, 'run', { stdout: result.stdout, diagnostics: result.stderr });
    phase = 'trace';
    const tracePath = path.join(job, 'trace.jsonl');
    let traceText;
    try {
      const info = await stat(tracePath);
      if (info.size > LIMITS.bytes) throw new Error('轨迹超过 25 MB');
      traceText = await readFile(tracePath, 'utf8');
    } catch (error) {
      throw new RunError(error.code === 'ENOENT' ? '程序已结束，但没有执行到采集行。请选择实际会执行、且变量仍在作用域内的行。' : error.message, 'trace', { stdout: result.stdout });
    }
    parseTrace(traceText);
    return { trace: traceText, stdout: result.stdout, stderr: result.stderr, diagnostics: compiled.stdout + compiled.stderr, compiler: compiler.name, durationMs: Date.now() - started };
  } catch (error) {
    if (error.phase === 'process') throw new RunError(`${phase === 'compile' ? '编译' : '运行'}：${error.message}`, phase, { stdout: error.stdout, diagnostics: error.stderr });
    if (error instanceof RunError) throw error;
    throw new RunError(error.message, phase);
  } finally {
    // Delete only the exact job directory created by mkdtemp within this workspace.
    const resolved = path.resolve(job);
    if (path.dirname(resolved) === path.resolve(jobsRoot) && path.basename(resolved).startsWith('run-')) {
      await rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
    }
  }
}
