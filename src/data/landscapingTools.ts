import { createToolUtils, type Tool } from './types';

export const landscapingTools: Tool[] = [];

const { getToolBySlug, getToolsByCategory, getRelatedTools } = createToolUtils(landscapingTools);
export { getToolBySlug, getToolsByCategory, getRelatedTools };
