import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/** -------------------- 类型 -------------------- */
interface PackageManifest {
  /** workspace 包名 */
  name: string
  /** 生产依赖 */
  dependencies?: Record<string, string>
}

interface WorkspacePackage {
  /** workspace 根目录 */
  dir: string
  /** workspace 包配置 */
  manifest: PackageManifest
}

interface ModuleReference {
  /** 引用所在文件 */
  file: string
  /** 模块说明符 */
  specifier: string
}

interface WorkspaceFixtureOptions {
  /** client 是否声明 shared-ui 依赖 */
  dependency?: boolean
  /** 相对 client workspace 的 fixture 文件 */
  files: Record<string, string>
}

/** -------------------- 常量 -------------------- */
/** 仓库根目录 */
const rootDir = fileURLToPath(new URL('../..', import.meta.url))

describe('workspace package boundaries', () => {
  it('@socilab imports are declared as production dependencies', () => {
    expect(readUndeclaredDependencyViolations(rootDir)).toEqual([])
  })

  it('workspace source only crosses packages through public exports', () => {
    expect(readPublicImportViolations(rootDir)).toEqual([])
  })

  it('模块引用收集覆盖 CSS、TypeScript 扩展名与 require 语法', () => {
    const fixtureRoot = createWorkspaceFixture({
      files: {
        'src/component.tsx': 'export { cn } from \'@socilab/shared-ui\'\n',
        'src/global.d.ts': 'type SharedUi = import(\'@socilab/shared-ui\')\n',
        'src/index.ts': 'import \'@socilab/shared-ui\'\n',
        'src/legacy.cts': [
          'import sharedUi = require(\'@socilab/shared-ui\')',
          'const shared = require(\'@socilab/shared-ui\')',
          'export { shared, sharedUi }',
          '',
        ].join('\n'),
        'src/module.mts': 'export const load = () => import(\'@socilab/shared-ui\')\n',
        'src/styles.css': '@import "@socilab/shared-ui/styles.css";\n',
      },
    })

    try {
      const client = readWorkspaces(fixtureRoot)
        .find(workspace => workspace.manifest.name === '@socilab/client')

      if (!client)
        throw new Error('测试 fixture 缺少 client workspace')

      expect(readSourceImports(client).map(({ file, specifier }) => (
        `${path.relative(fixtureRoot, file)}:${specifier}`
      )).sort()).toEqual([
        'projects/client/src/component.tsx:@socilab/shared-ui',
        'projects/client/src/global.d.ts:@socilab/shared-ui',
        'projects/client/src/index.ts:@socilab/shared-ui',
        'projects/client/src/legacy.cts:@socilab/shared-ui',
        'projects/client/src/legacy.cts:@socilab/shared-ui',
        'projects/client/src/module.mts:@socilab/shared-ui',
        'projects/client/src/styles.css:@socilab/shared-ui/styles.css',
      ])
      expect(readUndeclaredDependencyViolations(fixtureRoot)).toEqual([])
      expect(readPublicImportViolations(fixtureRoot)).toEqual([])
    }
    finally {
      rmSync(fixtureRoot, { force: true, recursive: true })
    }
  })

  it('隔离 fixture 捕获缺依赖、源码深导入与跨 workspace 相对导入', () => {
    const undeclaredRoot = createWorkspaceFixture({
      dependency: false,
      files: {
        'src/styles.css': '@import "@socilab/shared-ui/styles.css";\n',
      },
    })
    const deepImportRoot = createWorkspaceFixture({
      files: {
        'src/deep.mts': 'import \'@socilab/shared-ui/src/index\'\n',
      },
    })
    const relativeImportRoot = createWorkspaceFixture({
      files: {
        'src/cross.cts': 'require(\'../../../packages/shared-ui/src/index\')\n',
      },
    })

    try {
      expect(readUndeclaredDependencyViolations(undeclaredRoot)).toEqual([
        'projects/client/src/styles.css imports undeclared @socilab/shared-ui',
      ])
      expect(readPublicImportViolations(deepImportRoot)).toEqual([
        'projects/client/src/deep.mts deep imports @socilab/shared-ui/src/index',
      ])
      expect(readPublicImportViolations(relativeImportRoot)).toEqual([
        'projects/client/src/cross.cts crosses into packages/shared-ui',
      ])
    }
    finally {
      rmSync(undeclaredRoot, { force: true, recursive: true })
      rmSync(deepImportRoot, { force: true, recursive: true })
      rmSync(relativeImportRoot, { force: true, recursive: true })
    }
  })
})

/** -------------------- 内部函数 -------------------- */
/** 读取未声明 workspace 生产依赖的模块引用 */
function readUndeclaredDependencyViolations(root: string) {
  return readWorkspaces(root).flatMap((workspace) => {
    const dependencies = workspace.manifest.dependencies ?? {}

    return readSourceImports(workspace).flatMap(({ file, specifier }) => {
      const dependency = specifier.match(/^(@socilab\/[^/]+)/)?.[1]

      if (!dependency || dependency === workspace.manifest.name || Reflect.has(dependencies, dependency))
        return []

      return [`${path.relative(root, file)} imports undeclared ${dependency}`]
    })
  })
}

/** 读取绕过 workspace 公开出口的模块引用 */
function readPublicImportViolations(root: string) {
  const workspaces = readWorkspaces(root)

  return workspaces.flatMap(workspace => (
    readSourceImports(workspace).flatMap(({ file, specifier }) => {
      if (/^@socilab\/[^/]+\/src(?:\/|$)/.test(specifier))
        return [`${path.relative(root, file)} deep imports ${specifier}`]
      if (!specifier.startsWith('.'))
        return []

      const target = path.resolve(path.dirname(file), specifier)
      const targetWorkspace = workspaces.find(item => isWithinDir(target, item.dir))

      return targetWorkspace && targetWorkspace.dir !== workspace.dir
        ? [`${path.relative(root, file)} crosses into ${path.relative(root, targetWorkspace.dir)}`]
        : []
    })
  ))
}

/** 读取 packages 与 projects 下的全部 workspace */
function readWorkspaces(root: string): WorkspacePackage[] {
  return ['packages', 'projects'].flatMap((group) => {
    const groupDir = path.join(root, group)

    return readdirSync(groupDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map((entry) => {
        const dir = path.join(groupDir, entry.name)
        const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageManifest

        return { dir, manifest }
      })
  })
}

/** 读取单个 workspace 生产源码中的模块依赖 */
function readSourceImports(workspace: WorkspacePackage): ModuleReference[] {
  return readSourceFiles(path.join(workspace.dir, 'src')).flatMap((file) => {
    if (file.endsWith('.css'))
      return readCssImports(file)

    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const imports: ModuleReference[] = []

    /** 收集静态、动态与类型位置中的模块说明符 */
    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)
      ) {
        imports.push({ file, specifier: node.moduleSpecifier.text })
      }
      else if (
        ts.isImportEqualsDeclaration(node)
        && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression
        && ts.isStringLiteral(node.moduleReference.expression)
      ) {
        imports.push({ file, specifier: node.moduleReference.expression.text })
      }
      else if (
        ts.isCallExpression(node)
        && (
          node.expression.kind === ts.SyntaxKind.ImportKeyword
          || (ts.isIdentifier(node.expression) && node.expression.text === 'require')
        )
      ) {
        const [argument] = node.arguments

        if (argument && ts.isStringLiteral(argument))
          imports.push({ file, specifier: argument.text })
      }
      else if (
        ts.isImportTypeNode(node)
        && ts.isLiteralTypeNode(node.argument)
        && ts.isStringLiteral(node.argument.literal)
      ) {
        imports.push({ file, specifier: node.argument.literal.text })
      }

      ts.forEachChild(node, visit)
    }

    visit(source)

    return imports
  })
}

/** 读取 CSS import 中的模块说明符 */
function readCssImports(file: string): ModuleReference[] {
  const source = readFileSync(file, 'utf8')

  return source.split(';').flatMap((rule) => {
    const specifier = /^\s*@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/.exec(rule)?.[1]

    return specifier ? [{ file, specifier }] : []
  })
}

/** 递归读取目录中的模块源码 */
function readSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const target = path.join(dir, entry.name)

      if (entry.isDirectory())
        return readSourceFiles(target)

      return /(?:(?:\.d)?\.[cm]?ts|\.tsx|\.css)$/.test(entry.name) ? [target] : []
    })
}

/** 创建只包含 shared-ui 与 client 的临时 workspace fixture */
function createWorkspaceFixture(options: WorkspaceFixtureOptions) {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-workspace-boundaries-'))
  const sharedUiDir = path.join(root, 'packages/shared-ui')
  const clientDir = path.join(root, 'projects/client')
  const dependency = options.dependency === false
    ? {}
    : { '@socilab/shared-ui': 'workspace:*' }

  writeFixtureFile(path.join(sharedUiDir, 'package.json'), JSON.stringify({
    name: '@socilab/shared-ui',
  }))
  writeFixtureFile(path.join(sharedUiDir, 'src/index.ts'), 'export const sharedUi = true\n')
  writeFixtureFile(path.join(clientDir, 'package.json'), JSON.stringify({
    name: '@socilab/client',
    dependencies: dependency,
  }))

  for (const [file, source] of Object.entries(options.files))
    writeFixtureFile(path.join(clientDir, file), source)

  return root
}

/** 写入临时 fixture 文件并创建父目录 */
function writeFixtureFile(file: string, source: string) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, source)
}

/** 判断路径是否属于指定 workspace */
function isWithinDir(target: string, dir: string) {
  const relative = path.relative(dir, target)

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
