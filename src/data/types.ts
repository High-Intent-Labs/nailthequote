export interface Tool {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  category: 'technical' | 'business' | 'template' | 'sales';
  categoryLabel: string;
  description: string;
  shortDescription: string;
  seoTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  monthlySV: number;
  difficulty: 1 | 2;
  layer: string;
  cluster: string;
  relatedTools: string[];
  tradeName: string;
  tradeSlug: string;
}

export const categoryColors = {
  technical: { text: 'text-[#60A5FA]', bg: 'bg-[rgba(96,165,250,0.1)]', label: 'Technical' },
  business: { text: 'text-[#34D399]', bg: 'bg-[rgba(52,211,153,0.1)]', label: 'Business' },
  template: { text: 'text-[#C084FC]', bg: 'bg-[rgba(192,132,252,0.1)]', label: 'Template' },
  sales: { text: 'text-[#FBBF24]', bg: 'bg-[rgba(251,191,36,0.1)]', label: 'Sales' },
} as const;

export interface Trade {
  name: string;
  slug: string;
  icon: string;
  toolCount: number;
  status: 'live' | 'coming';
}

export function createToolUtils(tools: Tool[]) {
  return {
    getToolBySlug: (slug: string): Tool | undefined => tools.find(t => t.slug === slug),
    getToolsByCategory: (category: Tool['category']): Tool[] => tools.filter(t => t.category === category),
    getRelatedTools: (slug: string): Tool[] => {
      const tool = tools.find(t => t.slug === slug);
      if (!tool) return [];
      return tool.relatedTools
        .map(s => tools.find(t => t.slug === s))
        .filter((t): t is Tool => t !== undefined);
    },
  };
}
