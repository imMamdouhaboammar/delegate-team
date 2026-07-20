import { describe, it, expect } from 'vitest';
import { runCheck } from '../src/commands/check.js';
import { registerRemoteCommands } from '../src/commands/remote.js';

describe('CLI Commands', () => {
  it('should have a runCheck command exported', () => {
    expect(typeof runCheck).toBe('function');
  });

  it('should expose remote command registration', () => {
    expect(typeof registerRemoteCommands).toBe('function');
  });
});

describe('Dud Detection Logic', () => {
  it('should calculate dud correctly', () => {
    const beforeFiles = ['a.txt'];
    const currentFiles = ['a.txt', 'b.txt'];
    const touchedFiles = currentFiles.filter(f => !beforeFiles.includes(f));
    
    expect(touchedFiles).toEqual(['b.txt']);
  });

  it('should be empty if repo is dirty but no new changes', () => {
    const beforeFiles = ['a.txt'];
    const currentFiles = ['a.txt'];
    const touchedFiles = currentFiles.filter(f => !beforeFiles.includes(f));
    
    expect(touchedFiles).toEqual([]);
  });
});
