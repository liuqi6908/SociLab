import vscodeSettings from './.vscode/settings.json' with { type: 'json' }

/** -------------------- 配置出口 -------------------- */
export default {
  ignorePaths: [
    'docs/assets/**',
    'pnpm-lock.yaml',
  ],
  version: '0.2',
  words: vscodeSettings['cSpell.words'],
}
