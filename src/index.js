// @ts-check
import { learnStyle as learnStyleCore } from './core/learn.js';
import { generateGuide as generateGuideMarkdown } from './output/markdown.js';
import { generateConfigs as generateConfigsCore } from './output/config.js';
import { generateIterationReport as generateIterationReportCore } from './output/iteration-report.js';
import { applyStyle as applyStyleCore } from './apply/apply.js';
import { startMcpServer as startMcpServerCore } from './mcp/server.js';

export const learnStyle = learnStyleCore;
export const generateGuide = generateGuideMarkdown;
export const generateConfigs = generateConfigsCore;
export const generateIterationReport = generateIterationReportCore;
export const applyStyle = applyStyleCore;
export const startMcpServer = startMcpServerCore;
