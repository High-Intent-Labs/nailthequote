import { createToolUtils, type Tool } from './types';

export const gcTools: Tool[] = [];

const { getToolBySlug, getToolsByCategory, getRelatedTools } = createToolUtils(gcTools);
export { getToolBySlug, getToolsByCategory, getRelatedTools };
