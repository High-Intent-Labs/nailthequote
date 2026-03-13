import { createToolUtils, type Tool } from './types';

export const electricalTools: Tool[] = [];

const { getToolBySlug, getToolsByCategory, getRelatedTools } = createToolUtils(electricalTools);
export { getToolBySlug, getToolsByCategory, getRelatedTools };
