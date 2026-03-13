import { createToolUtils, type Tool } from './types';

export const pestControlTools: Tool[] = [];

const { getToolBySlug, getToolsByCategory, getRelatedTools } = createToolUtils(pestControlTools);
export { getToolBySlug, getToolsByCategory, getRelatedTools };
