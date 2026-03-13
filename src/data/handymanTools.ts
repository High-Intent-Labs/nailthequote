import { createToolUtils, type Tool } from './types';

export const handymanTools: Tool[] = [];

const { getToolBySlug, getToolsByCategory, getRelatedTools } = createToolUtils(handymanTools);
export { getToolBySlug, getToolsByCategory, getRelatedTools };
