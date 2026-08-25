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
    'no-void': 'error',
    'require-await': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
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

/** -------------------- 配置出口 -------------------- */
export default antfu(
  config,
  reactHooks.configs.flat.recommended,
)
