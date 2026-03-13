import { createToolUtils, type Tool } from './types';

export const roofingTools: Tool[] = [];

const { getToolBySlug, getToolsByCategory, getRelatedTools } = createToolUtils(roofingTools);
export { getToolBySlug, getToolsByCategory, getRelatedTools };
