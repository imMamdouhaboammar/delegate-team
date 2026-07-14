```markdown
# delegate-team Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `delegate-team` TypeScript repository. It covers file organization, code style, commit message structure, and testing practices, providing clear examples and actionable commands to streamline your workflow.

## Coding Conventions

### File Naming
- Use **kebab-case** for all file names.
  - Example: `user-service.ts`, `api-handler.test.ts`

### Import Style
- Use **relative imports** for referencing local modules.
  - Example:
    ```typescript
    import { fetchData } from './api-utils';
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```typescript
    // In user-service.ts
    export function getUser(id: string) { ... }
    ```

### Commit Messages
- Follow **conventional commit** format.
- Common prefixes: `ci`, `docs`
  - Example:
    ```
    ci: update build pipeline for deployment
    docs: add usage instructions to README
    ```

## Workflows

### Commit Changes
**Trigger:** When committing code or documentation changes  
**Command:** `/commit`

1. Stage your changes:
    ```
    git add .
    ```
2. Write a commit message using the conventional format:
    ```
    git commit -m "ci: update build pipeline"
    ```
3. Push your changes:
    ```
    git push
    ```

### Run Tests
**Trigger:** Before pushing or merging code  
**Command:** `/test`

1. Identify test files matching `*.test.*`
2. Run your test runner (framework not specified; adjust as needed):
    ```
    # Example with Jest
    npx jest
    ```
    or
    ```
    # Example with Mocha
    npx mocha "**/*.test.ts"
    ```

## Testing Patterns

- Test files follow the `*.test.*` naming pattern.
  - Example: `user-service.test.ts`
- The specific testing framework is not defined; adapt commands to your project's setup.
- Example test structure:
    ```typescript
    // user-service.test.ts
    import { getUser } from './user-service';

    describe('getUser', () => {
      it('returns user data for valid id', () => {
        // test implementation
      });
    });
    ```

## Commands
| Command   | Purpose                                 |
|-----------|-----------------------------------------|
| /commit   | Guide for conventional commit workflow  |
| /test     | Run all test files in the repository    |
```
