import fs from 'fs';
import path from 'node:path';
import { marked } from 'marked';

export async function load() {
    // Read the markdown file
    const markdownPath = path.join(process.cwd(), 'src/lib/projects.md');
    const markdownContent = fs.readFileSync(markdownPath, 'utf-8');
    
    // Parse markdown to HTML
    const htmlContent = marked(markdownContent);
    
    // Parse projects from markdown (extract individual projects)
    const projects = parseProjectsFromMarkdown(markdownContent);
    
    return {
        projects,
        htmlContent
    };
}

function parseProjectsFromMarkdown(markdown: string) {
    const projects = [];
    const lines = markdown.split('\n');
    let currentProject = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Project title (## Project Name)
        if (line.startsWith('## ') && !line.startsWith('# ')) {
            if (currentProject) {
                projects.push(currentProject);
            }
            currentProject = {
                title: line.replace('## ', ''),
                status: '',
                technologies: '',
                description: ''
            };
        }
        // Status line
        else if (line.startsWith('**Status:**') && currentProject) {
            currentProject.status = line.replace('**Status:**', '').trim();
        }
        // Technologies line
        else if (line.startsWith('**Technologies:**') && currentProject) {
            currentProject.technologies = line.replace('**Technologies:**', '').trim();
        }
        // Description line
        else if (line.startsWith('**Description:**') && currentProject) {
            currentProject.description = line.replace('**Description:**', '').trim();
        }
    }
    
    // Add the last project
    if (currentProject) {
        projects.push(currentProject);
    }
    
    return projects;
}
