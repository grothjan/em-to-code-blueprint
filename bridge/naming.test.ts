import { describe, it, expect } from 'vitest';
import {
  toKebab,
  toPascalCase,
  isValidPascalCase,
  toFqcn,
  fromFqcn,
  normalizeName,
  normalizeContext,
  getContextPath,
  getCommandPath,
  getEventPath,
  getInformationPath,
  getRegistryFilePath,
  getAutomationFolder,
  getAutomationPath,
  getProjectionCasePath
} from './naming.js';

describe('naming', () => {
  describe('toKebab', () => {
    it('converts simple PascalCase to kebab-case', () => {
      expect(toKebab('TaskManagement')).toBe('task-management');
      expect(toKebab('AddTodo')).toBe('add-todo');
      expect(toKebab('CreateUser')).toBe('create-user');
    });

    it('converts multiple words PascalCase to kebab-case', () => {
      expect(toKebab('CreateNewUserAccount')).toBe('create-new-user-account');
    });

    it('handles sequences of uppercase letters', () => {
      expect(toKebab('JSONParser')).toBe('json-parser');
      expect(toKebab('XMLHttpRequest')).toBe('xml-http-request');
    });

    it('handles mixed case with existing hyphens', () => {
      expect(toKebab('some-existing-Name')).toBe('some-existing-name');
    });

    it('handles empty string', () => {
      expect(toKebab('')).toBe('');
    });
  });

  describe('toPascalCase', () => {
    it('converts kebab-case to PascalCase', () => {
      expect(toPascalCase('task-management')).toBe('TaskManagement');
      expect(toPascalCase('add-todo')).toBe('AddTodo');
      expect(toPascalCase('create-user')).toBe('CreateUser');
    });

    it('converts multiple words kebab-case to PascalCase', () => {
      expect(toPascalCase('create-new-user-account')).toBe('CreateNewUserAccount');
    });

    it('handles single word', () => {
      expect(toPascalCase('task')).toBe('Task');
    });

    it('handles empty string', () => {
      expect(toPascalCase('')).toBe('');
    });

    it('handles uppercase input', () => {
      expect(toPascalCase('TASK')).toBe('TASK');
    });
  });

  describe('isValidPascalCase', () => {
    it('accepts valid PascalCase names', () => {
      expect(isValidPascalCase('A')).toBe(true);
      expect(isValidPascalCase('AddTodo')).toBe(true);
      expect(isValidPascalCase('CrmCreateUser')).toBe(true);
      expect(isValidPascalCase('A123')).toBe(true);
      expect(isValidPascalCase('Xyz123Abc')).toBe(true);
    });

    it('rejects invalid names', () => {
      expect(isValidPascalCase('')).toBe(false);
      expect(isValidPascalCase('addTodo')).toBe(false);
      expect(isValidPascalCase('Add_Todo')).toBe(false);
      expect(isValidPascalCase('Add-Todo')).toBe(false);
      expect(isValidPascalCase('123Add')).toBe(false);
      expect(isValidPascalCase('add todo')).toBe(false);
      expect(isValidPascalCase('task-management')).toBe(false);
    });

    it('matches the CLI regex ^[A-Z][a-zA-Z0-9]*$', () => {
      const cliRegex = /^[A-Z][a-zA-Z0-9]*$/;
      
      const validNames = ['A', 'AddTodo', 'CrmCreateUser', 'A123', 'Xyz123Abc'];
      validNames.forEach(name => {
        expect(isValidPascalCase(name)).toBe(cliRegex.test(name));
      });

      const invalidNames = ['', 'addTodo', 'Add_Todo', 'Add-Todo', '123Add', 'add todo', 'task-management'];
      invalidNames.forEach(name => {
        expect(isValidPascalCase(name)).toBe(cliRegex.test(name));
      });
    });
  });

  describe('toFqcn', () => {
    it('builds FQCN from context and name', () => {
      expect(toFqcn('Crm', 'CreateUser')).toBe('Crm.CreateUser');
      expect(toFqcn('TaskManagement', 'AddTodo')).toBe('TaskManagement.AddTodo');
    });
  });

  describe('fromFqcn', () => {
    it('parses FQCN into context and name', () => {
      expect(fromFqcn('Crm.CreateUser')).toEqual({ context: 'Crm', name: 'CreateUser' });
      expect(fromFqcn('TaskManagement.AddTodo')).toEqual({ context: 'TaskManagement', name: 'AddTodo' });
    });

    it('handles names without context (defaults to App)', () => {
      expect(fromFqcn('CreateUser')).toEqual({ context: 'App', name: 'CreateUser' });
      expect(fromFqcn('AddTodo')).toEqual({ context: 'App', name: 'AddTodo' });
    });

    it('handles invalid FQCN', () => {
      expect(fromFqcn('')).toEqual({ context: 'App', name: '' });
      expect(fromFqcn('.')).toEqual({ context: 'App', name: '' });
    });
  });

  describe('normalizeName', () => {
    it('keeps valid PascalCase as-is', () => {
      expect(normalizeName('AddTodo')).toBe('AddTodo');
    });

    it('converts kebab-case to PascalCase', () => {
      expect(normalizeName('create-user')).toBe('CreateUser');
    });

    it('converts space-separated to PascalCase', () => {
      expect(normalizeName('create user')).toBe('CreateUser');
    });

    it('handles FQCN format', () => {
      expect(normalizeName('Crm.CreateUser')).toBe('CreateUser');
      expect(normalizeName('TaskManagement.AddTodo')).toBe('AddTodo');
    });
  });

  describe('normalizeContext', () => {
    it('keeps valid PascalCase as-is', () => {
      expect(normalizeContext('Crm')).toBe('Crm');
      expect(normalizeContext('TaskManagement')).toBe('TaskManagement');
    });

    it('converts lowercase to PascalCase', () => {
      expect(normalizeContext('crm')).toBe('Crm');
    });

    it('converts kebab-case to PascalCase', () => {
      expect(normalizeContext('task-management')).toBe('TaskManagement');
    });
  });

  describe('path helpers', () => {
    describe('getContextPath', () => {
      it('generates context folder path', () => {
        expect(getContextPath('Crm')).toBe('src/domain/crm');
        expect(getContextPath('TaskManagement')).toBe('src/domain/task-management');
      });
    });

    describe('getCommandPath', () => {
      it('generates command folder path', () => {
        expect(getCommandPath('Crm', 'CreateUser')).toBe('src/domain/crm/commands/create-user');
        expect(getCommandPath('TaskManagement', 'AddTodo')).toBe('src/domain/task-management/commands/add-todo');
      });
    });

    describe('getEventPath', () => {
      it('generates event folder path', () => {
        expect(getEventPath('Crm', 'UserCreated')).toBe('src/domain/crm/events/user-created');
        expect(getEventPath('TaskManagement', 'TodoAdded')).toBe('src/domain/task-management/events/todo-added');
      });
    });

    describe('getInformationPath', () => {
      it('generates information folder path', () => {
        expect(getInformationPath('Crm', 'UserList')).toBe('src/domain/crm/information/user-list');
        expect(getInformationPath('TaskManagement', 'TodoList')).toBe('src/domain/task-management/information/todo-list');
      });
    });

    describe('getRegistryFilePath', () => {
      it('generates registry file paths', () => {
        expect(getRegistryFilePath('Crm', 'command')).toBe('src/domain/crm/commands.ts');
        expect(getRegistryFilePath('Crm', 'event')).toBe('src/domain/crm/events.ts');
        expect(getRegistryFilePath('Crm', 'query')).toBe('src/domain/crm/queries.ts');
        expect(getRegistryFilePath('Crm', 'job')).toBe('src/domain/crm/job-automations.ts');
      });
    });

    describe('getAutomationFolder', () => {
      it('returns correct folder for automation type', () => {
        expect(getAutomationFolder('event')).toBe('automations/events');
        expect(getAutomationFolder('job')).toBe('automations/jobs');
      });
    });

    describe('getAutomationPath', () => {
      it('generates automation path for event automation', () => {
        expect(getAutomationPath('Crm', 'SendNotification', 'event')).toBe('src/domain/crm/automations/events/send-notification');
      });

      it('generates automation path for job automation', () => {
        expect(getAutomationPath('Crm', 'ProcessTodo', 'job')).toBe('src/domain/crm/automations/jobs/process-todo');
      });
    });

    describe('getProjectionCasePath', () => {
      it('generates projection case path', () => {
        expect(getProjectionCasePath('Crm', 'UserList', 'UserCreated')).toBe('src/domain/crm/information/user-list/projection/user-created');
      });
    });
  });
});
