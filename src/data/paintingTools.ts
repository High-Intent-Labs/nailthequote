import { createToolUtils, type Tool } from './types';

export const paintingTools: Tool[] = [];

const { getToolBySlug, getToolsByCategory, getRelatedTools } = createToolUtils(paintingTools);
export { getToolBySlug, getToolsByCategory, getRelatedTools };
