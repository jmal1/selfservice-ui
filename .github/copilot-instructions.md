## Design Context

### Users
Cybersecurity students using Crucible in classroom and home environments to deploy and manage virtual lab environments (VMs, pods, snapshots). They need to quickly spin up isolated networks, access VMs via SSH/RDP/console, and manage resources without deep infrastructure knowledge.

### Brand Personality
Approachable · Clean · Utilitarian

The interface should feel like a reliable tool — not flashy, not intimidating. Students should feel confident managing infrastructure even if they're new to it. Clarity over decoration.

### Aesthetic Direction
- **Visual tone**: Clean, functional, utility-first. Warm industrial feel via the "Fire Orange" primary color, offset by cool steel blue accents. Dark mode default suits the cybersecurity context.
- **Theme**: Skeleton v4 with custom "Crucible" theme using OKLCH color system. Fire Orange primary, Steel Blue secondary, Molten Gold tertiary.
- **Anti-references**: Overly gamified dashboards, flashy neon-on-dark "hacker" aesthetics, cluttered enterprise UIs.
- **References**: Proxmox VE, Portainer, GitHub — functional tools that respect the user's time.

### Design Principles
1. **Clarity first**: Every element should communicate its purpose immediately. Labels, statuses, and actions must be unambiguous.
2. **Reduce friction**: Deploying a VM should feel as easy as ordering coffee. Minimize clicks, show progress, surface errors clearly.
3. **Respect the task**: Users are here to learn cybersecurity, not admire the UI. Stay out of the way.
4. **Consistent feedback**: Every action should produce visible, timely feedback — loading states, toasts, status badges.
5. **Accessible by default**: WCAG AA compliance. Clear contrast, keyboard navigation, semantic HTML.
