// @ts-check
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { learnStyle } from '../core/learn.js';
import { generateGuide } from '../output/markdown.js';
import { generateConfigs } from '../output/config.js';
import { generateIterationReport } from '../output/iteration-report.js';
import { validateProfile } from '../output/profile.js';
import { applyStyle } from '../apply/apply.js';
import { readJson, writeText } from '../util/fs.js';

/**
 * @typedef {{ name: string, description: string, inputSchema: Record<string, unknown> }} McpTool
 */

/** @returns {McpTool[]} */
export function cdoTools() {
  return [
    {
      name: 'cdo.learn_style',
      description: 'Learn coding style from repositories.',
      inputSchema: {
        type: 'object',
        properties: {
          repoPaths: { type: 'array', items: { type: 'string' } },
          authorEmails: { type: 'array', items: { type: 'string' } },
          maxFilesPerRepo: { type: 'integer', minimum: 1 },
          sampleSize: { type: 'integer', minimum: 1 },
          minEvidence: { type: 'integer', minimum: 1 },
          minConfidence: { type: 'number', minimum: 0, maximum: 1 },
          inferenceMode: { enum: ['deterministic', 'llm-mcp'] },
          llmSamplingMode: { enum: ['compact', 'full'] },
          sampleContent: { enum: ['compact', 'full'] },
          llmAugmenterCommand: { type: 'string' }
        },
        required: ['repoPaths']
      }
    },
    {
      name: 'cdo.generate_style_guide',
      description: 'Generate markdown style guide from a CDO profile.',
      inputSchema: {
        type: 'object',
        properties: {
          profilePath: { type: 'string' },
          outFile: { type: 'string' }
        },
        required: ['profilePath']
      }
    },
    {
      name: 'cdo.generate_agent_templates',
      description: 'Generate biome/grit/agent templates from a CDO profile.',
      inputSchema: {
        type: 'object',
        properties: {
          profilePath: { type: 'string' },
          outDir: { type: 'string' }
        },
        required: ['profilePath']
      }
    },
    {
      name: 'cdo.generate_iteration_report',
      description: 'Generate confidence/diff iteration report from profile + apply report.',
      inputSchema: {
        type: 'object',
        properties: {
          profilePath: { type: 'string' },
          applyReportPath: { type: 'string' },
          previousProfilePath: { type: 'string' },
          outFile: { type: 'string' }
        },
        required: ['profilePath', 'applyReportPath']
      }
    },
    {
      name: 'cdo.apply_style',
      description: 'Apply safe style transforms from profile to repository files.',
      inputSchema: {
        type: 'object',
        properties: {
          profilePath: { type: 'string' },
          repoPaths: { type: 'array', items: { type: 'string' } },
          engine: { enum: ['biome'] },
          write: { type: 'boolean' },
          safeOnly: { type: 'boolean' },
          reportPath: { type: 'string' }
        },
        required: ['profilePath', 'repoPaths']
      }
    }
  ];
}

/**
 * @param {string} name
 * @param {Record<string, any>} args
 */
export async function callCdoTool(name, args) {
  switch (name) {
    case 'cdo.learn_style': {
      const profile = await learnStyle({
        repoPaths: args.repoPaths,
        authorEmails: args.authorEmails,
        maxFilesPerRepo: args.maxFilesPerRepo ?? args.sampleSize,
        minEvidence: args.minEvidence,
        minConfidence: args.minConfidence,
        inferenceMode: args.inferenceMode,
        llmSamplingMode: args.llmSamplingMode ?? args.sampleContent,
        llmAugmenterCommand: args.llmAugmenterCommand
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }]
      };
    }

    case 'cdo.generate_style_guide': {
      const profile = await readJson(args.profilePath);
      validateProfile(profile);
      const markdown = generateGuide(profile);
      if (args.outFile) {
        await writeText(args.outFile, markdown);
      }
      return {
        content: [{ type: 'text', text: markdown }]
      };
    }

    case 'cdo.generate_agent_templates': {
      const profile = await readJson(args.profilePath);
      validateProfile(profile);
      const outputs = await generateConfigs(profile, { outDir: args.outDir ?? '.cdo' });
      return {
        content: [{ type: 'text', text: JSON.stringify(outputs, null, 2) }]
      };
    }

    case 'cdo.generate_iteration_report': {
      const profile = await readJson(args.profilePath);
      validateProfile(profile);
      const applyReport = await readJson(args.applyReportPath);
      const previousProfile = args.previousProfilePath ? await readJson(args.previousProfilePath) : null;
      if (previousProfile) validateProfile(previousProfile);
      const report = generateIterationReport(profile, applyReport, previousProfile);
      if (args.outFile) {
        await writeText(args.outFile, `${JSON.stringify(report, null, 2)}\n`);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(report, null, 2) }]
      };
    }

    case 'cdo.apply_style': {
      const report = await applyStyle({
        profile: args.profilePath,
        repoPaths: args.repoPaths,
        engine: args.engine,
        write: args.write,
        safeOnly: args.safeOnly,
        reportPath: args.reportPath
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(report, null, 2) }]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * @param {{ serverName?: string, serverVersion?: string }} [options]
 */
export async function startMcpServer(options = {}) {
  const server = new Server(
    {
      name: options.serverName ?? 'cdo',
      version: options.serverVersion ?? '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: cdoTools()
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = /** @type {Record<string, any>} */ (request.params.arguments ?? {});
    return callCdoTool(request.params.name, args);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
