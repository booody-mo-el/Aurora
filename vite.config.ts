import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dyadComponentTagger from '@dyad-sh/react-vite-component-tagger';
export default defineConfig({plugins:[dyadComponentTagger(), react()],root:'.',build:{outDir:'dist',emptyOutDir:true},server:{host:'0.0.0.0',port:3000,hmr:false}});
