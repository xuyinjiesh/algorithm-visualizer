import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { parseTrace } from '../src/trace.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const build = path.join(root, 'build');
const traces = path.join(root, 'traces');
mkdirSync(build, { recursive: true }); mkdirSync(traces, { recursive: true });
const examples = ['bfs', 'tree', 'list', 'dp'];
const testMode = process.argv.includes('--test');
const targets = testMode ? [{ name: 'contract', source: 'tests/contract.cpp' }] : examples.map(name => ({ name, source: `examples/${name}.cpp` }));
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} exited with ${result.status}`);
}
let cxx = process.env.CXX;
if (!cxx) for (const name of ['g++', 'clang++']) {
  const result = spawnSync(name, ['--version'], { stdio: 'ignore' });
  if (result.status === 0) { cxx = name; break; }
}
if (cxx) {
  for (const {name,source} of targets) run(cxx, ['-std=c++17', '-Wall', '-Wextra', '-pedantic', '-Iinclude', source, '-o', path.join(build, name + (process.platform === 'win32' ? '.exe' : ''))]);
} else if (process.platform === 'win32') {
  const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
  let install;
  if (existsSync(vswhere)) install = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).stdout?.trim();
  const vcvars = path.join(install || 'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools', 'VC/Auxiliary/Build/vcvars64.bat');
  if (!existsSync(vcvars)) throw new Error('Install a C++17 compiler or set CXX to its executable.');
  const commands = ['@echo off', `call "${vcvars}" >nul`, 'if errorlevel 1 exit /b 1'];
  for (const {name,source} of targets) commands.push(`cl /nologo /std:c++17 /EHsc /utf-8 /W4 /Iinclude "${source}" /Fe:"build/${name}.exe" /Fo:"build/${name}.obj"`, 'if errorlevel 1 exit /b 1');
  const script = path.join(build, 'compile.cmd');
  writeFileSync(script, commands.join('\r\n'));
  run('cmd.exe', ['/d', '/c', 'build\\compile.cmd']);
} else throw new Error('Install g++ or clang++, or set CXX.');
if (testMode) {
  const output = path.join(build, 'contract.jsonl');
  run(path.join(build, 'contract' + (process.platform === 'win32' ? '.exe' : '')), [output]);
  const trace = parseTrace(readFileSync(output, 'utf8'));
  if (trace.frames.length !== 3 || trace.frames[0].structures.length !== 1 || trace.frames[1].structures.length !== 1 || trace.frames[2].structures.length !== 0) throw new Error('Watch lifetime contract failed');
  if (trace.frames[0].label !== '中文 "quote" \\ slash\nnewline\tTAB') throw new Error('JSON escaping contract failed');
  console.log('C++ adapter, validation, JSON escaping and watch lifetime checks passed.');
} else {
  for (const name of examples) run(path.join(build, name + (process.platform === 'win32' ? '.exe' : '')), [path.join(traces, `${name}.jsonl`)]);
  for (const mode of ['matrix', 'star']) run(path.join(build, 'bfs' + (process.platform === 'win32' ? '.exe' : '')), [path.join(traces, `bfs-${mode}.jsonl`), mode]);
  console.log('Built four C++ examples and generated six real execution traces.');
}
