import { createToolUtils, type Tool } from './types';

export const cleaningTools: Tool[] = [];

const { getToolBySlug, getToolsByCategory, getRelatedTools } = createToolUtils(cleaningTools);
export { getToolBySlug, getToolsByCategory, getRelatedTools };
