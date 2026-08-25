import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  readClassNameDiagnostics,
  readExplicitExportDiagnostics,
  readInterfaceCommentDiagnostics,
  readModuleIndexDiagnostics,
  readPrivateMemberDiagnostics,
  readReactComponentDiagnostics,
  readReactHookOrderDiagnostics,
  readRepositoryTypeScriptSources,
  readTestLocationDiagnostics,
  scanRepositoryQuality,
} from './quality-guards'

/** -------------------- 测试夹具 -------------------- */
const fixtureRoot = path.resolve(import.meta.dirname, 'fixtures')

function fixture(name: string, filePath = 'fixture.ts') {
  return {
    filePath,
    source: readFileSync(path.join(fixtureRoot, name), 'utf8'),
  }
}

/** -------------------- 显式导出 -------------------- */
describe('显式导出守卫', () => {
  it('捕获源码 default export、星号导出与缺少命名导出的模块', () => {
    const diagnostics = readExplicitExportDiagnostics([
      fixture('explicit-exports/invalid.fixture'),
      fixture('explicit-exports/unexported.fixture', 'unexported.ts'),
    ])

    expect(diagnostics.map(item => `${item.filePath}:${item.kind}`)).toEqual([
      'fixture.ts:default-export',
      'fixture.ts:wildcard-export',
      'fixture.ts:default-export',
      'fixture.ts:missing-named-export',
      'unexported.ts:missing-named-export',
    ])
    expect(diagnostics.slice(0, 3).map(item => [item.line, item.column])).toEqual([
      [3, 1],
      [4, 1],
      [5, 1],
    ])
  })

  it('接受命名导出以及无需导出的应用入口', () => {
    expect(readExplicitExportDiagnostics([
      fixture('explicit-exports/valid.fixture'),
      fixture('explicit-exports/entry.fixture', 'projects/client/src/main.tsx'),
      fixture('explicit-exports/entry.fixture', 'projects/server/src/main.ts'),
    ])).toEqual([])
  })
})

/** -------------------- 公共接口注释 -------------------- */
describe('公共 Interface JSDoc 守卫', () => {
  it('捕获导出 Interface 声明与成员缺失的 JSDoc', () => {
    const diagnostics = readInterfaceCommentDiagnostics([
      fixture('interface-comments/invalid.fixture'),
    ])

    expect(diagnostics.map(item => `${item.interfaceName}:${item.target}`)).toEqual([
      'MissingDocumentation:interface',
      'MissingDocumentation:value',
      'MissingMemberDocumentation:value',
    ])
    expect(diagnostics.map(item => [item.line, item.column])).toEqual([
      [1, 1],
      [2, 3],
      [7, 3],
    ])
  })

  it('接受完整公共 JSDoc 且不要求内部 Interface', () => {
    expect(readInterfaceCommentDiagnostics([
      fixture('interface-comments/valid.fixture'),
    ])).toEqual([])
  })

  it('检查本文件命名导出和别名导出的本地 Interface', () => {
    const diagnostics = readInterfaceCommentDiagnostics([
      fixture('interface-comments/indirect-invalid.fixture'),
    ])

    expect(diagnostics.map(item => `${item.interfaceName}:${item.target}`)).toEqual([
      'Input:interface',
      'Input:value',
      'AliasInput:interface',
      'AliasInput:count',
    ])
    expect(readInterfaceCommentDiagnostics([
      fixture('interface-comments/indirect-valid.fixture'),
    ])).toEqual([])
  })
})

/** -------------------- 模块出口 -------------------- */
describe('模块 index 出口守卫', () => {
  it('捕获真正模块目录缺失 index.ts 且不宽泛豁免相似目录名', () => {
    const diagnostics = readModuleIndexDiagnostics([
      fixture('explicit-exports/valid.fixture', 'packages/example/src/index.ts'),
      fixture('explicit-exports/valid.fixture', 'packages/example/src/feature/item.ts'),
      fixture('explicit-exports/valid.fixture', 'packages/example/src/my-routes/item.ts'),
      fixture('explicit-exports/valid.fixture', 'packages/missing/src/feature/index.ts'),
      fixture('explicit-exports/valid.fixture', 'projects/server/src/server.ts'),
    ])

    expect(diagnostics.map(item => item.directoryPath)).toEqual([
      'packages/example/src/feature',
      'packages/example/src/my-routes',
      'packages/missing/src',
      'projects/server/src',
    ])
  })

  it('接受显式 index、项目入口、声明文件与 TanStack routes 目录', () => {
    expect(readModuleIndexDiagnostics([
      fixture('explicit-exports/valid.fixture', 'packages/example/src/index.ts'),
      fixture('explicit-exports/valid.fixture', 'packages/example/src/feature/index.ts'),
      fixture('explicit-exports/valid.fixture', 'packages/example/src/feature/item.ts'),
      fixture('explicit-exports/valid.fixture', 'projects/client/src/main.tsx'),
      fixture('explicit-exports/valid.fixture', 'projects/client/src/vite-env.d.ts'),
      fixture('react/valid.fixture', 'projects/client/src/routes/detail/page.tsx'),
    ])).toEqual([])
  })

  it('从叶文件向上登记 package、project src 根与中间模块目录', () => {
    const diagnostics = readModuleIndexDiagnostics([
      fixture('explicit-exports/valid.fixture', 'packages/example/src/index.ts'),
      fixture('explicit-exports/valid.fixture', 'packages/example/src/features/account/index.ts'),
      fixture('explicit-exports/entry.fixture', 'projects/client/src/main.tsx'),
      fixture('explicit-exports/valid.fixture', 'projects/client/src/features/settings/index.ts'),
      fixture('explicit-exports/valid.fixture', 'projects/client/src/routes/detail/page.tsx'),
      fixture('explicit-exports/valid.fixture', 'projects/worker/src/jobs/nightly/index.ts'),
    ])

    expect(diagnostics.map(item => item.directoryPath)).toEqual([
      'packages/example/src/features',
      'projects/client/src/features',
      'projects/worker/src',
      'projects/worker/src/jobs',
    ])
  })
})

/** -------------------- 类成员 -------------------- */
describe('private 成员守卫', () => {
  it('捕获字段、方法与构造器 parameter property 的非下划线名称', () => {
    const diagnostics = readPrivateMemberDiagnostics([
      fixture('private-members/invalid.fixture'),
    ])

    expect(diagnostics.map(item => item.name)).toEqual([
      'value',
      'dependency',
      'read',
    ])
    expect(diagnostics.map(item => [item.line, item.column])).toEqual([
      [2, 11],
      [4, 39],
      [6, 11],
    ])
  })

  it('接受下划线 private 成员和构造器 parameter property', () => {
    expect(readPrivateMemberDiagnostics([
      fixture('private-members/valid.fixture'),
    ])).toEqual([])
  })
})

/** -------------------- React -------------------- */
describe('react 组件与 Hook 顺序守卫', () => {
  it('捕获 PascalCase 箭头组件', () => {
    expect(readReactComponentDiagnostics([
      fixture('react/invalid.fixture', 'fixture.tsx'),
    ]).map(item => item.name)).toEqual(['ArrowComponent'])
  })

  it('接受 function 组件声明', () => {
    expect(readReactComponentDiagnostics([
      fixture('react/valid.fixture', 'fixture.tsx'),
    ])).toEqual([])
  })

  it('忽略返回普通值的 PascalCase 回调并捕获 wrapper 与 block 箭头组件', () => {
    expect(readReactComponentDiagnostics([
      fixture('react/component-evidence-valid.fixture', 'component-evidence-valid.tsx'),
    ])).toEqual([])

    expect(readReactComponentDiagnostics([
      fixture('react/component-wrappers-invalid.fixture', 'component-wrappers-invalid.tsx'),
    ]).map(item => [item.name, item.line, item.column])).toEqual([
      ['MemoComponent', 3, 14],
      ['ForwardedComponent', 4, 14],
      ['FactoryComponent', 7, 7],
      ['BlockComponent', 8, 14],
    ])
    expect(readReactComponentDiagnostics([
      fixture('react/component-wrappers-invalid.fixture', 'component-wrappers-invalid.tsx'),
    ]).map(item => item.name)).toEqual([
      'MemoComponent',
      'ForwardedComponent',
      'FactoryComponent',
      'BlockComponent',
    ])
  })

  it('捕获 Effect 后的 state Hook 与事件函数后的 memo Hook', () => {
    const diagnostics = readReactHookOrderDiagnostics([
      fixture('react/invalid.fixture', 'fixture.tsx'),
    ])

    expect(diagnostics.map(item => item.hookName)).toEqual([
      'useState',
      'useMemo',
    ])
  })

  it('接受 common、state、memo、事件与 Effect 的稳定顺序', () => {
    expect(readReactHookOrderDiagnostics([
      fixture('react/valid.fixture', 'fixture.tsx'),
    ])).toEqual([])
  })

  it('按源码位置排列同一声明项并在违规后保持最高阶段', () => {
    const diagnostics = readReactHookOrderDiagnostics([
      fixture('react/hook-order-edge.fixture', 'hook-order-edge.tsx'),
    ])

    expect(diagnostics.map(item => `${item.scope}:${item.hookName}`)).toEqual([
      'SameStatementInvalid:useMemo',
      'HighestStageMustNotRollback:useState',
      'HighestStageMustNotRollback:useMemo',
    ])
    expect(diagnostics.map(item => [item.line, item.column])).toEqual([
      [10, 43],
      [17, 19],
      [18, 20],
    ])
  })
})

/** -------------------- className -------------------- */
describe('tailwind 与 className 守卫', () => {
  it('捕获动态 Tailwind 模板、字符串拼接和数组 join 组合', () => {
    const diagnostics = readClassNameDiagnostics([
      fixture('class-name/invalid.fixture', 'fixture.tsx'),
    ])

    expect(diagnostics.map(item => [item.kind, item.line])).toEqual([
      ['array-composition', 2],
      ['dynamic-template', 6],
      ['string-concatenation', 7],
      ['string-concatenation', 9],
      ['dynamic-template', 10],
      ['array-composition', 11],
      ['string-concatenation', 12],
      ['string-concatenation', 13],
    ])
  })

  it('接受 cn 的静态候选条件组合', () => {
    expect(readClassNameDiagnostics([
      fixture('class-name/valid.fixture', 'fixture.tsx'),
    ])).toEqual([])
  })

  it('按使用位置解析跨组件与嵌套作用域的最近 className 绑定', () => {
    expect(readClassNameDiagnostics([
      fixture('class-name/shadowing-valid.fixture', 'shadowing-valid.tsx'),
    ])).toEqual([])

    expect(readClassNameDiagnostics([
      fixture('class-name/shadowing-invalid.fixture', 'shadowing-invalid.tsx'),
    ]).map(item => item.kind)).toEqual(['string-concatenation'])
  })
})

/** -------------------- 测试位置 -------------------- */
describe('测试目录守卫', () => {
  it('捕获生产源码内测试与 tests 根目录测试', () => {
    const invalid = fixture('test-structure/invalid.fixture')
    const diagnostics = readTestLocationDiagnostics([
      { ...invalid, filePath: 'projects/client/src/app.test.ts' },
      { ...invalid, filePath: 'tests/root.test.ts' },
    ])

    expect(diagnostics.map(item => item.kind)).toEqual([
      'outside-tests',
      'missing-domain-directory',
    ])
  })

  it('接受 tests 领域目录内测试', () => {
    expect(readTestLocationDiagnostics([
      fixture('test-structure/valid.fixture', 'tests/client/app.test.ts'),
    ])).toEqual([])
  })
})

/** -------------------- 源码枚举 -------------------- */
it('源码枚举排除生成文件、构建产物、依赖、临时目录与负 fixture', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-linter-'))

  try {
    for (const directoryPath of [
      'packages/example/src',
      'packages/example/dist',
      'projects/client/node_modules/example',
      'tests/client',
      'tests/linter/fixtures',
      'tests/tmp',
    ]) {
      mkdirSync(path.join(root, directoryPath), { recursive: true })
    }

    for (const filePath of [
      'packages/example/src/index.ts',
      'packages/example/src/routeTree.gen.ts',
      'packages/example/dist/output.ts',
      'projects/client/node_modules/example/index.ts',
      'tests/client/app.test.ts',
      'tests/linter/fixtures/invalid.ts',
      'tests/tmp/generated.ts',
    ]) {
      writeFileSync(path.join(root, filePath), 'export const value = true\n')
    }

    expect(readRepositoryTypeScriptSources(undefined, root).map(item => item.filePath)).toEqual([
      'packages/example/src/index.ts',
      'tests/client/app.test.ts',
    ])
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

/** -------------------- 仓库 Gate -------------------- */
it('真实仓库通过全部通用 AST 质量守卫', () => {
  expect(scanRepositoryQuality()).toEqual([])
})
