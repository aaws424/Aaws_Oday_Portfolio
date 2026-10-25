// Everything personal on the site lives here. Edit this file to update your details.

export const site = {
  name: 'Aaws Oday',
  role: 'Technical 3D Artist',
  description:
    'Aaws Oday — Technical 3D Artist and tools developer. Procedural generation, simulation, Blender Python add-ons, Geometry Nodes, GPU compute shaders and C++ geometry processing.',
  email: 'aawsoday@gmail.com',
  location: 'Baghdad, Iraq',
  // Leave a link as '' to hide it everywhere on the site.
  links: {
    linkedin: 'https://www.linkedin.com/in/aaws-oday/',
    github: 'https://github.com/aaws424',
    youtube: '',
    artstation: '',
  },
};

export const socialLinks = [
  { label: 'LinkedIn', url: site.links.linkedin },
  { label: 'GitHub', url: site.links.github },
  { label: 'YouTube', url: site.links.youtube },
  { label: 'ArtStation', url: site.links.artstation },
].filter((link) => link.url);

export const focusAreas = [
  {
    title: 'Procedural generation',
    text: 'Cities, parcels, terrain and scattering systems driven by rules and math instead of hand placement.',
  },
  {
    title: 'Pipeline tools',
    text: 'Blender add-ons in Python (bpy, bmesh) that extend the software and remove manual bottlenecks.',
  },
  {
    title: 'Simulation',
    text: 'Hydraulic, thermal and fluvial erosion, vehicle physics, crowds, pathfinding and ragdolls.',
  },
  {
    title: 'GPU & C++',
    text: 'GLSL compute shaders, OpenMesh geometry processing and OpenCV / libvips imaging.',
  },
];

export const experience = [
  {
    company: 'Parametra',
    role: 'Technical 3D Artist',
    period: 'Sep 2024 — Present',
    points: [
      'Architect custom Python add-ons and tools that extend core software functionality, streamline artist pipelines and reduce manual workflow bottlenecks.',
      'Integrate local large language models and AI image-generation pipelines into existing workflows to accelerate PBR material creation.',
    ],
  },
  {
    company: 'Freelance',
    role: 'Blender Content Creator',
    period: '2022 — Present',
    points: [
      'Produce and publish technical tutorials that break down complex mathematical algorithms and advanced Geometry Nodes workflows for procedural asset generation.',
    ],
    link: site.links.youtube ? { label: 'Watch the tutorials', url: site.links.youtube } : undefined,
  },
];

export const skills = [
  { group: 'Programming & Shaders', items: ['Python', 'C++', 'GLSL', 'GDScript'] },
  { group: '3D Software & Engines', items: ['Blender', 'Geometry Nodes', 'Godot', 'Unreal Engine', 'Unity'] },
  { group: 'Libraries & APIs', items: ['Blender Python API (bpy, bmesh)', 'Blender gpu module', 'OpenMesh', 'OpenCV', 'libvips'] },
  { group: 'Tools & Build Systems', items: ['CMake', 'MSVC', 'vcpkg', 'Visual Studio', 'Git'] },
];
