// @ts-check
import traverse from '@babel/traverse';
import { collectCommentSignals } from './comment-signals.js';
import { collectLineLayoutSignals } from './layout-signals.js';
import { createSignals, finalizeMemberExpressionVotes } from './signals.js';
import {
  hasBlankLineBefore,
  isGuardExitStatement,
  multilineTernaryOperatorPlacement,
  nameWordCount,
  nodeEnd,
  updateOrderingStats,
  updateTrailingCommaStats,
  updateYodaStats
} from './syntax-helpers.js';

/**
 * @typedef {import('./signals.js').FileSignals} FileSignals
 */

/**
 * @param {string} source
 * @param {import('@babel/types').File} ast
 * @returns {FileSignals}
 */
export function extractFileSignals(source, ast) {
  const signals = createSignals();
  const lines = source.split('\n');
  signals.totalLines = lines.length;

  collectLineLayoutSignals(lines, signals);
  collectCommentSignals(lines, ast.comments ?? [], signals);

  traverse.default(ast, {
    Function(path) {
      let fnName = '';
      if (path.node.id?.type === 'Identifier') {
        fnName = path.node.id.name;
      } else if (path.parentPath.isVariableDeclarator() && path.parentPath.node.id.type === 'Identifier') {
        fnName = path.parentPath.node.id.name;
      } else if (path.parentPath.isObjectProperty() && path.parentPath.node.key.type === 'Identifier') {
        fnName = path.parentPath.node.key.name;
      }

      if (fnName) {
        const words = nameWordCount(fnName);
        if (words <= 1) signals.functionNamesSingle += 1;
        else signals.functionNamesMulti += 1;
      }

      if (path.isFunctionExpression()) {
        if (path.node.id?.type === 'Identifier') {
          signals.functionExprNamed += 1;
        } else {
          signals.functionExprAnonymous += 1;
        }
      }

      const isTopLevelDeclaration =
        path.isFunctionDeclaration() &&
        path.parentPath.isProgram();
      const isTopLevelVariableFunction =
        path.parentPath.isVariableDeclarator() &&
        path.parentPath.parentPath?.isVariableDeclaration() &&
        path.parentPath.parentPath.parentPath?.isProgram();

      if (isTopLevelDeclaration || isTopLevelVariableFunction) {
        signals.functionsTotal += 1;

        const leading = path.node.leadingComments ?? [];
        if (
          leading.some(
            (comment) =>
              comment.type === 'CommentBlock' &&
              comment.value.startsWith('*') &&
              (path.node.loc?.start.line ?? 0) - (comment.loc?.end.line ?? 0) <= 1
          )
        ) {
          signals.functionsWithJsdoc += 1;
        }
      }

      if (path.node.body?.type === 'BlockStatement') {
        const statements = path.node.body.body.filter((statement) => statement.type !== 'EmptyStatement');
        if (statements.length >= 2) {
          const first = statements[0];
          const isGuardClause =
            first.type === 'IfStatement' &&
            !first.alternate &&
            isGuardExitStatement(first.consequent);

          if (isGuardClause) signals.guardClauseFunctions += 1;
          else signals.nonGuardClauseFunctions += 1;
        }
      }

      updateTrailingCommaStats(source, path.node, path.node.params, signals);
    },

    IfStatement(path) {
      updateYodaStats(path.node.test, signals);

      const parentNode = path.parentPath.node;
      const partOfElseChain =
        parentNode?.type === 'IfStatement' &&
        parentNode.alternate === path.node;
      if (!partOfElseChain) {
        const ifLine = path.node.loc?.start.line;
        if (typeof ifLine === 'number') {
          if (hasBlankLineBefore(ifLine, lines)) signals.blankLineBeforeIfYes += 1;
          else signals.blankLineBeforeIfNo += 1;
        }
      }

      // This rule is about style for one-statement ifs, not control-flow complexity.
      if (path.node.alternate) return;
      if (path.node.consequent.type === 'BlockStatement') {
        if (path.node.consequent.body.length !== 1) return;
        const startLine = path.node.loc?.start.line;
        const endLine = path.node.loc?.end.line;
        if (typeof startLine !== 'number' || typeof endLine !== 'number' || startLine !== endLine) return;
        signals.ifWithBraces += 1;
        return;
      }

      const ifLine = path.node.loc?.start.line;
      const statementStart = path.node.consequent.loc?.start.line;
      const statementEnd = path.node.consequent.loc?.end.line;
      if (
        typeof ifLine !== 'number' ||
        typeof statementStart !== 'number' ||
        typeof statementEnd !== 'number' ||
        ifLine !== statementStart ||
        statementStart !== statementEnd
      ) {
        return;
      }

      signals.ifWithoutBraces += 1;
    },

    ConditionalExpression(path) {
      const placement = multilineTernaryOperatorPlacement(source, path.node);
      if (!placement) return;
      if (placement === 'leading') signals.ternaryMultilineLeading += 1;
      else signals.ternaryMultilineTrailing += 1;
    },

    SwitchStatement(path) {
      const switchColumn = path.node.loc?.start.column;
      if (typeof switchColumn !== 'number') return;

      for (const caseNode of path.node.cases) {
        const caseColumn = caseNode.loc?.start.column;
        if (typeof caseColumn !== 'number') continue;

        if (caseColumn > switchColumn) signals.switchCaseIndented += 1;
        else signals.switchCaseFlat += 1;

        for (const statement of caseNode.consequent) {
          if (statement.type !== 'BreakStatement') continue;
          const breakColumn = statement.loc?.start.column;
          if (typeof breakColumn !== 'number') continue;

          if (breakColumn <= caseColumn) signals.switchCaseBreakMatchCase += 1;
          else signals.switchCaseBreakIndented += 1;
        }
      }
    },

    MemberExpression(path) {
      const objectStartLine = path.node.object.loc?.start.line;
      const objectStartColumn = path.node.object.loc?.start.column;
      const memberLine = path.node.property.loc?.start.line;

      if (
        typeof objectStartLine !== 'number' ||
        typeof objectStartColumn !== 'number' ||
        typeof memberLine !== 'number'
      ) {
        return;
      }

      if (memberLine <= objectStartLine) return;
      const continuation = lines[memberLine - 1];
      if (!continuation) return;
      if (!/^\s*\./.test(continuation)) return;

      const continuationColumn = continuation.match(/^\s*/)?.[0].length ?? 0;
      if (continuationColumn <= objectStartColumn) signals.memberExprAligned += 1;
      else signals.memberExprIndented += 1;
    },

    StringLiteral(path) {
      const raw = path.node.extra?.raw;
      if (!raw) return;
      if (raw.startsWith("'")) signals.quotesSingle += 1;
      else if (raw.startsWith('"')) signals.quotesDouble += 1;
    },

    ExpressionStatement(path) {
      const end = nodeEnd(path.node);
      if (end < 1) return;
      const hasSemi = source[end - 1] === ';';
      if (hasSemi) signals.semicolonsYes += 1;
      else signals.semicolonsNo += 1;
    },

    VariableDeclaration(path) {
      const end = nodeEnd(path.node);
      if (end < 1) return;
      const hasSemi = source[end - 1] === ';';
      if (hasSemi) signals.semicolonsYes += 1;
      else signals.semicolonsNo += 1;

      const declarations = path.node.declarations;
      if (declarations.length < 2) return;

      for (let index = 1; index < declarations.length; index += 1) {
        const previous = declarations[index - 1];
        const current = declarations[index];
        if (typeof previous.end !== 'number' || typeof current.start !== 'number') continue;

        const between = source.slice(previous.end, current.start);
        if (!between.includes('\n')) continue;
        if (/\/\//.test(between) || /\/\*/.test(between)) continue;

        const commaIndex = between.indexOf(',');
        if (commaIndex === -1) continue;

        const beforeComma = between.slice(0, commaIndex);
        const afterComma = between.slice(commaIndex + 1);
        const lastLineBreak = beforeComma.lastIndexOf('\n');
        const beforeCommaLine = lastLineBreak === -1
          ? beforeComma
          : beforeComma.slice(lastLineBreak + 1);
        const newlineBeforeComma = beforeComma.includes('\n');
        const newlineAfterComma = afterComma.includes('\n');
        const isLeading = newlineBeforeComma && beforeCommaLine.trim() === '';
        const isTrailing = !newlineBeforeComma && newlineAfterComma;

        if (isLeading) {
          signals.variableDeclarationCommaLeading += 1;
          continue;
        }

        if (isTrailing) {
          signals.variableDeclarationCommaTrailing += 1;
        }
      }
    },

    ReturnStatement(path) {
      const end = nodeEnd(path.node);
      if (end < 1) return;
      const hasSemi = source[end - 1] === ';';
      if (hasSemi) signals.semicolonsYes += 1;
      else signals.semicolonsNo += 1;

      const parent = path.parentPath.node;
      const parentBodyLength =
        parent?.type === 'BlockStatement' ? parent.body.length : 0;
      if (parentBodyLength > 1) {
        const line = path.node.loc?.start.line;
        if (typeof line === 'number') {
          if (hasBlankLineBefore(line, lines)) signals.blankLineBeforeReturnYes += 1;
          else signals.blankLineBeforeReturnNo += 1;
        }
      }
    },

    ImportDeclaration(path) {
      const end = nodeEnd(path.node);
      if (end > 0) {
        const hasSemi = source[end - 1] === ';';
        if (hasSemi) signals.semicolonsYes += 1;
        else signals.semicolonsNo += 1;
      }
    },

    ArrayExpression(path) {
      updateTrailingCommaStats(source, path.node, path.node.elements, signals);
    },

    ObjectExpression(path) {
      updateTrailingCommaStats(source, path.node, path.node.properties, signals);
    },

    CallExpression(path) {
      const callStart = path.node.loc?.start.line;
      const callEnd = path.node.loc?.end.line;
      const firstArg = path.node.arguments[0];
      const firstArgLine = firstArg?.loc?.start.line;
      if (
        typeof callStart === 'number' &&
        typeof callEnd === 'number' &&
        typeof firstArgLine === 'number' &&
        callEnd > callStart
      ) {
        if (firstArgLine === callStart) signals.multilineCallArgumentCompact += 1;
        else signals.multilineCallArgumentExpanded += 1;
      }

      updateTrailingCommaStats(source, path.node, path.node.arguments, signals);
    },

    Program(path) {
      const imports = path.node.body
        .filter((node) => node.type === 'ImportDeclaration')
        .map((node) => node.source.value.toLowerCase());
      updateOrderingStats(imports, signals);

      /** @type {string[]} */
      const requires = [];
      for (const statement of path.node.body) {
        if (statement.type === 'VariableDeclaration') {
          for (const declaration of statement.declarations) {
            const init = declaration.init;
            if (
              init?.type === 'CallExpression' &&
              init.callee.type === 'Identifier' &&
              init.callee.name === 'require' &&
              init.arguments.length === 1 &&
              init.arguments[0].type === 'StringLiteral'
            ) {
              requires.push(init.arguments[0].value.toLowerCase());
            }
          }
          continue;
        }

        if (
          statement.type === 'ExpressionStatement' &&
          statement.expression.type === 'CallExpression' &&
          statement.expression.callee.type === 'Identifier' &&
          statement.expression.callee.name === 'require' &&
          statement.expression.arguments.length === 1 &&
          statement.expression.arguments[0].type === 'StringLiteral'
        ) {
          requires.push(statement.expression.arguments[0].value.toLowerCase());
        }
      }

      updateOrderingStats(requires, signals);
    }
  });

  finalizeMemberExpressionVotes(signals);
  return signals;
}
