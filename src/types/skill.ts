export interface SkillInfo {
  name: string;
  description: string;
  content: string;
  location: string;
  enabled: boolean;
  hooks?: {
    pre?: string[];
    post?: string[];
  };
}

export interface SkillConfig {
  skills: SkillInfo[];
  paths: string[];
}

export interface RemoteSkillInfo {
  id: string;
  slug: string;
  name: string;
  description: string;
  source: 'clawhub' | 'skillhub';
  owner?: string;
  downloads?: number;
  installMode?: string;
}
