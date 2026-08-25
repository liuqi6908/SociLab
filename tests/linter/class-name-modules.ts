import type { ParsedTypeScriptSource } from './quality-guard-source'
import path from 'node:path'
import * as ts from 'typescript'

/** -------------------- 类型 -------------------- */
interface ModuleImport {
  /** 导入后的模块局部名称 */
  localName: string
  /** 来源模块说明符 */
  moduleSpecifier: string
  /** 来源模块导出名称 */
  sourceName: string
}

interface ModuleExport {
  /** 可选来源模块说明符 */
  moduleSpecifier?: string
  /** 当前出口指向的局部或来源名称 */
  sourceName: string
}

interface ClassNameModule<RecordType> {
  /** 模块级样式常量 */
  constants: Map<string, RecordType>
  /** 声明处直接导出的名称 */
  directExports: Set<string>
  /** 模块文件路径 */
  filePath: string
  /** 显式命名出口 */
  namedExports: Map<string, ModuleExport>
  /** 命名导入 */
  namedImports: Map<string, ModuleImport>
}

/** -------------------- 核心函数 -------------------- */
/**
 * 创建按模块路径追踪显式样式常量出口的导入解析器
 */
export function createClassNameModuleResolver<
  RecordType extends { declaration: ts.VariableDeclaration },
>(
  parsedSources: readonly ParsedTypeScriptSource[],
  recordsByDeclaration: ReadonlyMap<ts.VariableDeclaration, RecordType>,
) {
  const modules = new Map<string, ClassNameModule<RecordType>>()

  for (const { filePath, sourceFile } of parsedSources) {
    const normalizedFilePath = normalizeFilePath(filePath)
    const module: ClassNameModule<RecordType> = {
      constants: new Map(),
      directExports: new Set(),
      filePath: normalizedFilePath,
      namedExports: new Map(),
      namedImports: new Map(),
    }

    for (const statement of sourceFile.statements) {
      if (ts.isVariableStatement(statement)) {
        const isExported = ts.getModifiers(statement)?.some(modifier => (
          modifier.kind === ts.SyntaxKind.ExportKeyword
        )) === true

        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name))
            continue

          const record = recordsByDeclaration.get(declaration)

          if (!record)
            continue

          module.constants.set(declaration.name.text, record)

          if (isExported)
            module.directExports.add(declaration.name.text)
        }
      }
      else if (
        ts.isImportDeclaration(statement)
        && !statement.importClause?.isTypeOnly
        && statement.importClause?.namedBindings
        && ts.isNamedImports(statement.importClause.namedBindings)
        && ts.isStringLiteral(statement.moduleSpecifier)
        && statement.moduleSpecifier.text.startsWith('.')
      ) {
        for (const specifier of statement.importClause.namedBindings.elements) {
          if (specifier.isTypeOnly)
            continue

          module.namedImports.set(specifier.name.text, {
            localName: specifier.name.text,
            moduleSpecifier: statement.moduleSpecifier.text,
            sourceName: specifier.propertyName?.text ?? specifier.name.text,
          })
        }
      }
      else if (
        ts.isExportDeclaration(statement)
        && !statement.isTypeOnly
        && statement.exportClause
        && ts.isNamedExports(statement.exportClause)
      ) {
        const moduleSpecifier = statement.moduleSpecifier

        if (
          moduleSpecifier
          && (
            !ts.isStringLiteral(moduleSpecifier)
            || !moduleSpecifier.text.startsWith('.')
          )
        ) {
          continue
        }

        for (const specifier of statement.exportClause.elements) {
          if (specifier.isTypeOnly)
            continue

          module.namedExports.set(specifier.name.text, {
            moduleSpecifier: moduleSpecifier?.text,
            sourceName: specifier.propertyName?.text ?? specifier.name.text,
          })
        }
      }
    }

    modules.set(normalizedFilePath, module)
  }

  /**
   * 解析相对说明符指向的受检源码
   */
  function resolveModulePath(filePath: string, specifier: string) {
    const targetPath = path.posix.normalize(path.posix.join(
      path.posix.dirname(filePath),
      specifier,
    ))
    const runtimeExtension = targetPath.match(/\.(?:c|m)?jsx?$/)?.[0]
    const sourceBase = runtimeExtension
      ? targetPath.slice(0, -runtimeExtension.length)
      : targetPath
    const candidates = [
      targetPath,
      `${sourceBase}.ts`,
      `${sourceBase}.tsx`,
      `${sourceBase}.mts`,
      `${sourceBase}.cts`,
      `${targetPath}/index.ts`,
      `${targetPath}/index.tsx`,
      `${targetPath}/index.mts`,
      `${targetPath}/index.cts`,
    ]

    return candidates.find(candidate => modules.has(candidate))
  }

  /**
   * 沿显式命名出口解析最终模块级样式常量
   */
  function resolveExport(
    filePath: string,
    exportName: string,
    resolving: Set<string>,
  ): RecordType | undefined {
    const resolutionKey = `${filePath}\0${exportName}`

    if (resolving.has(resolutionKey))
      return

    resolving.add(resolutionKey)

    const module = modules.get(filePath)
    let record = module?.directExports.has(exportName)
      ? module.constants.get(exportName)
      : undefined
    const namedExport = module?.namedExports.get(exportName)

    if (!record && module && namedExport) {
      if (namedExport.moduleSpecifier) {
        const targetFilePath = resolveModulePath(
          module.filePath,
          namedExport.moduleSpecifier,
        )

        if (targetFilePath) {
          record = resolveExport(
            targetFilePath,
            namedExport.sourceName,
            resolving,
          )
        }
      }
      else {
        record = module.constants.get(namedExport.sourceName)
        const namedImport = module.namedImports.get(namedExport.sourceName)

        if (!record && namedImport) {
          const targetFilePath = resolveModulePath(
            module.filePath,
            namedImport.moduleSpecifier,
          )

          if (targetFilePath) {
            record = resolveExport(
              targetFilePath,
              namedImport.sourceName,
              resolving,
            )
          }
        }
      }
    }

    resolving.delete(resolutionKey)
    return record
  }

  /**
   * 读取指定模块命名导入最终对应的样式常量
   */
  return (filePath: string) => {
    const imported = new Map<string, RecordType>()
    const module = modules.get(normalizeFilePath(filePath))

    if (!module)
      return imported

    for (const namedImport of module.namedImports.values()) {
      const targetFilePath = resolveModulePath(
        module.filePath,
        namedImport.moduleSpecifier,
      )
      const record = targetFilePath
        ? resolveExport(targetFilePath, namedImport.sourceName, new Set())
        : undefined

      if (record)
        imported.set(namedImport.localName, record)
    }

    return imported
  }
}

/** -------------------- 内部函数 -------------------- */
/**
 * 将文件路径统一为模块图使用的 POSIX 路径
 */
function normalizeFilePath(filePath: string) {
  return path.posix.normalize(filePath.split(path.sep).join('/'))
}
