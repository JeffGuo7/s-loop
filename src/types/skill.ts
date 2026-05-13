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