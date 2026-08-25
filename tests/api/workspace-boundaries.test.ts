import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { startServer } from '../../projects/server/src'

/** -------------------- 类型 -------------------- */
interface PackageManifest {
  /** workspace 包名 */
  name: string
  /** 生产依赖 */
  dependencies?: Record<string, string>
  /** 公开出口 */
  exports?: Record<string, unknown>
}

interface WorkspacePackage {
  /** workspace 根目录 */
  dir: string
  /** workspace 包配置 */
  manifest: PackageManifest
}

/** -------------------- 常量 -------------------- */
/** 仓库根目录 */
const rootDir = fileURLToPath(new URL('../..', import.meta.url))
/** 当前仓库中的 workspace */
const workspaces = readWorkspaces()

describe('workspace package boundaries', () => {
  it('@socilab imports are declared as production dependencies', () => {
    const violations = workspaces.flatMap((workspace) => {
      const dependencies = workspace.manifest.dependencies ?? {}

      return readSourceImports(workspace).flatMap(({ file, specifier }) => {
        const dependency = specifier.match(/^(@socilab\/[^/]+)/)?.[1]

        if (!dependency || dependency === workspace.manifest.name || Reflect.has(dependencies, dependency))
          return []

        return [`${path.relative(rootDir, file)} imports undeclared ${dependency}`]
      })
    })

    expect(violations).toEqual([])
  })

  it('workspace source only crosses packages through public exports', () => {
    const violations = workspaces.flatMap(workspace => (
      readSourceImports(workspace).flatMap(({ file, specifier }) => {
        if (/^@socilab\/[^/]+\/src(?:\/|$)/.test(specifier))
          return [`${path.relative(rootDir, file)} deep imports ${specifier}`]
        if (!specifier.startsWith('.'))
          return []

        const target = path.resolve(path.dirname(file), specifier)
        const targetWorkspace = workspaces.find(item => isWithinDir(target, item.dir))

        return targetWorkspace && targetWorkspace.dir !== workspace.dir
          ? [`${path.relative(rootDir, file)} crosses into ${path.relative(rootDir, targetWorkspace.dir)}`]
          : []
      })
    ))

    expect(violations).toEqual([])
  })

  it('shared-ui and server declare their public root exports', () => {
    const sharedUi = workspaces.find(workspace => workspace.manifest.name === '@socilab/shared-ui')
    const server = workspaces.find(workspace => workspace.manifest.name === '@socilab/server')

    expect(sharedUi?.manifest.exports).toMatchObject({
      '.': {
        default: './src/index.ts',
        types: './src/index.ts',
      },
      './styles.css': './src/styles.css',
    })
    expect(server?.manifest.exports).toEqual({
      '.': {
        default: './dist/projects/server/src/index.js',
        types: './dist/projects/server/src/index.d.ts',
      },
    })
    expect(typeof startServer).toBe('function')
  })
})

/** -------------------- 内部函数 -------------------- */
/** 读取 packages 与 projects 下的全部 workspace */
function readWorkspaces(): WorkspacePackage[] {
  return ['packages', 'projects'].flatMap((group) => {
    const groupDir = path.join(rootDir, group)

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
function readSourceImports(workspace: WorkspacePackage) {
  return readSourceFiles(path.join(workspace.dir, 'src')).flatMap((file) => {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const imports: Array<{ file: string, specifier: string }> = []

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
        ts.isCallExpression(node)
        && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && ts.isStringLiteral(node.arguments[0])
      ) {
        imports.push({ file, specifier: node.arguments[0].text })
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

/** 递归读取目录中的 TypeScript 生产源码 */
function readSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name)

    if (entry.isDirectory())
      return readSourceFiles(target)

    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [target] : []
  })
}

/** 判断路径是否属于指定 workspace */
function isWithinDir(target: string, dir: string) {
  const relative = path.relative(dir, target)

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
