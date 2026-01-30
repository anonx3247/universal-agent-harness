import { listProfiles, getDefaultProfile } from './src/lib/profiles.ts';

console.log('Testing profile discovery...');
const profiles = listProfiles();
console.log('Profiles found:', profiles);

const defaultProfile = getDefaultProfile();
console.log('Default profile:', defaultProfile);
