/** Shared generative descriptors. Content is data; rendering and simulation consume it. */
export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface WorldLaws {
  seed: number;
  gravity: number;
  temperature: number;
  moisture: number;
  radiation: number;
  hue: number;
}
export type Locomotion = 'stride' | 'skitter' | 'hop' | 'slither' | 'hover';
export type EcologicalRole = 'grazer' | 'pollinator' | 'predator' | 'decomposer' | 'conductor';
export interface BodyNode {
  id: number;
  parent: number | null;
  offset: V3;
  radius: number;
  length: number;
}
export interface Appendage {
  id: number;
  parent: number;
  kind: 'leg' | 'wing' | 'tendril' | 'antenna';
  side: number;
  length: number;
  phase: number;
}
export interface SpeciesGenome {
  version: 1;
  seed: number;
  id: string;
  name: string;
  role: EcologicalRole;
  locomotion: Locomotion;
  nodes: BodyNode[];
  appendages: Appendage[];
  color: string;
  accent: string;
  eyes: number;
  pattern: number;
  mass: number;
  speed: number;
  jump: number;
  perception: number;
  temperament: number;
  affinity: 'heat' | 'cold' | 'charge' | 'growth';
  gait: { frequency: number; stride: number; lift: number; duty: number; wave: number };
  capabilities: string[];
  explanation: string;
}
export interface WeaponGenome {
  version: 1;
  seed: number;
  name: string;
  frame: 'edge' | 'hammer' | 'bow' | 'conduit' | 'relic';
  material: {
    name: string;
    density: number;
    elasticity: number;
    conductivity: number;
    color: string;
  };
  core: 'heat' | 'cold' | 'charge' | 'growth';
  trigger: 'impact' | 'projectile' | 'field';
  shape: { length: number; width: number; branches: number; curvature: number };
  damage: number;
  reach: number;
  recovery: number;
  projectileSpeed: number;
  power: number;
  explanation: string;
}
export interface LimbPose {
  id: number;
  kind: Appendage['kind'];
  hip: V3;
  joint: V3;
  tip: V3;
  planted: boolean;
}
export interface BodyPose {
  nodes: { id: number; position: V3; radius: number; length: number }[];
  limbs: LimbPose[];
  facing: number;
}
export interface MotionSample {
  position: V3;
  heading: number;
  speed: number;
  time: number;
  phase: number;
  grounded: boolean;
}
