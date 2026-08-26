import antfu from '@antfu/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

/** -------------------- 配置 -------------------- */
const config = {
  typescript: {
    overrides: {
      'ts/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
        },
      ],
    },
  },
  rules: {
    'no-console': 'off',
    'no-return-await': 'error',
    'no-void': 'error',
    'node/prefer-global/process': 'off',
    'prefer-promise-reject-errors': 'off',
    'require-await': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/ban-ts-comment': [
      'error',
      {
        'ts-ignore': 'allow-with-description',
        'ts-expect-error': true,
        'ts-nocheck': true,
        'ts-check': true,
      },
    ],
    'test/consistent-test-it': [
      'error',
      {
        fn: 'test',
        withinDescribe: 'test',
      },
    ],
    'test/prefer-lowercase-title': 'off',
  },
  ignores: [
    '**/routeTree.gen.ts',
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/.turbo/**',
    '**/.tmp/**',
    '**/tmp/**',
    '.agents/**',
    '.superpowers/**',
    'docs/**',
    'pnpm-workspace.yaml',
  ],
}

/** TSX 组件统一使用 function 声明，回调保留箭头函数 */
const tsxFunctionConfig = {
  name: 'socilab/tsx-functions',
  files: ['**/*.tsx'],
  rules: {
    'antfu/top-level-function': 'off',
    'no-restricted-syntax': [
      'error',
      'TSEnumDeclaration[const=true]',
      'TSExportAssignment',
      {
        selector: 'FunctionExpression',
        message: 'TSX 禁止 function 表达式；组件使用 function 声明，回调使用箭头函数',
      },
    ],
  },
}

/** -------------------- 配置出口 -------------------- */
export default antfu(
  config,
  reactHooks.configs.flat.recommended,
  tsxFunctionConfig,
)
