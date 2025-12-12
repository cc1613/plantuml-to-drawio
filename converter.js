class PlantUMLParser {
    constructor(input) {
        this.input = input;
        this.classes = [];
        this.relations = [];
        this.actors = [];
        this.usecases = [];
        this.components = [];
        this.nodes = [];
        this.notes = [];
        this.activities = [];
        this.diagramType = 'class';
    }

    parse() {
        const lines = this.input.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith("'"));
        
        // Detect activity diagram
        if (this.input.includes('start') && (this.input.includes('stop') || this.input.includes('end')) && 
            (this.input.includes(':') || this.input.includes('if ('))) {
            this.diagramType = 'activity';
            return this.parseActivityDiagram(lines);
        }
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('@startuml') || line.startsWith('@enduml')) continue;
            if (line.startsWith('skinparam') || line.startsWith('hide') || line.startsWith('show')) continue;
            
            // Detect diagram type
            if (line.includes('actor ')) this.diagramType = 'usecase';
            if (line.includes('component ') || line.includes('package ')) this.diagramType = 'component';
            if (line.includes('state ')) this.diagramType = 'state';
            
            // Parse class
            if (line.startsWith('class ') || line.startsWith('interface ') || line.startsWith('abstract ') || line.startsWith('enum ')) {
                const classData = this.parseClass(lines, i);
                if (classData) {
                    this.classes.push(classData.classObj);
                    i = classData.endIndex;
                }
                continue;
            }
            
            // Parse actor
            if (line.startsWith('actor ')) {
                const match = line.match(/actor\s+"?([^"]+)"?\s*(?:as\s+(\w+))?/);
                if (match) {
                    this.actors.push({ name: match[2] || match[1], label: match[1] });
                }
                continue;
            }
            
            // Parse usecase
            if (line.startsWith('usecase ') || line.match(/^\(.*\)/)) {
                const match = line.match(/(?:usecase\s+)?"?([^"(]+)"?\s*(?:as\s+)?(\w+)?/) || 
                              line.match(/\(([^)]+)\)\s*(?:as\s+(\w+))?/);
                if (match) {
                    this.usecases.push({ name: match[2] || match[1], label: match[1] });
                }
                continue;
            }
            
            // Parse component
            if (line.startsWith('component ') || line.startsWith('[')) {
                const match = line.match(/(?:component\s+)?"?([^"\[\]]+)"?\s*(?:as\s+(\w+))?/) ||
                              line.match(/\[([^\]]+)\]\s*(?:as\s+(\w+))?/);
                if (match) {
                    this.components.push({ name: match[2] || match[1], label: match[1] });
                }
                continue;
            }
            
            // Parse state
            if (line.startsWith('state ')) {
                const match = line.match(/state\s+"?([^"{}]+)"?\s*(?:as\s+(\w+))?/);
                if (match) {
                    this.nodes.push({ name: match[2] || match[1], label: match[1], type: 'state' });
                }
                continue;
            }
            
            // Parse note
            if (line.startsWith('note ')) {
                const match = line.match(/note\s+"([^"]+)"/);
                if (match) {
                    this.notes.push({ text: match[1] });
                }
                continue;
            }
            
            // Parse relations
            const relation = this.parseRelation(line);
            if (relation) {
                this.relations.push(relation);
            }
        }
        
        return {
            type: this.diagramType,
            classes: this.classes,
            relations: this.relations,
            actors: this.actors,
            usecases: this.usecases,
            components: this.components,
            nodes: this.nodes,
            notes: this.notes,
            activities: this.activities
        };
    }

    parseActivityDiagram(lines) {
        const activities = [];
        const edges = [];
        let nodeId = 0;
        let stack = []; // Stack for tracking conditional branches
        let noteBuffer = [];
        let inNote = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip metadata
            if (line.startsWith('@') || line.startsWith('!') || line.startsWith('skinparam') || 
                line.startsWith('title') || line === '') continue;
            
            // Handle multi-line notes
            if (line.startsWith('note ')) {
                inNote = true;
                noteBuffer = [line.replace(/note\s+(left|right|top|bottom)/, '').trim()];
                continue;
            }
            if (line === 'end note') {
                inNote = false;
                const noteText = noteBuffer.join('\n').replace(/^\s+/gm, '');
                if (activities.length > 0) {
                    activities[activities.length - 1].note = noteText;
                }
                noteBuffer = [];
                continue;
            }
            if (inNote) {
                noteBuffer.push(line);
                continue;
            }
            
            // Start node
            if (line === 'start') {
                activities.push({ id: nodeId++, type: 'start', label: 'Start' });
                continue;
            }
            
            // Stop/End node
            if (line === 'stop' || line === 'end') {
                activities.push({ id: nodeId++, type: 'end', label: 'End' });
                continue;
            }
            
            // Activity :text;
            const activityMatch = line.match(/^:(.+);$/);
            if (activityMatch) {
                activities.push({ id: nodeId++, type: 'action', label: activityMatch[1].trim() });
                continue;
            }
            
            // If condition
            const ifMatch = line.match(/^if\s*\((.+)\)\s*then\s*\((.+)\)$/);
            if (ifMatch) {
                const conditionId = nodeId++;
                activities.push({ 
                    id: conditionId, 
                    type: 'decision', 
                    label: ifMatch[1].trim(),
                    yesBranch: ifMatch[2].trim()
                });
                stack.push({ type: 'if', id: conditionId, hasElse: false });
                continue;
            }
            
            // Else branch
            const elseMatch = line.match(/^else\s*\((.+)\)$/);
            if (elseMatch && stack.length > 0) {
                const current = stack[stack.length - 1];
                current.hasElse = true;
                current.noBranch = elseMatch[1].trim();
                // Mark current position for else branch
                current.elseStartIndex = activities.length;
                continue;
            }
            
            // Endif
            if (line === 'endif') {
                if (stack.length > 0) {
                    const finished = stack.pop();
                    // Add merge node
                    activities.push({ id: nodeId++, type: 'merge', label: '', relatedDecision: finished.id });
                }
                continue;
            }
        }
        
        // Build edges based on sequence
        for (let i = 0; i < activities.length - 1; i++) {
            const current = activities[i];
            const next = activities[i + 1];
            
            if (current.type !== 'merge') {
                edges.push({ from: current.id, to: next.id, label: '' });
            }
        }
        
        return {
            type: 'activity',
            activities: activities,
            relations: edges,
            classes: [],
            actors: [],
            usecases: [],
            components: [],
            nodes: [],
            notes: []
        };
    }

    parseClass(lines, startIndex) {
        const line = lines[startIndex];
        const typeMatch = line.match(/^(class|interface|abstract|enum)\s+/);
        const type = typeMatch ? typeMatch[1] : 'class';
        
        const nameMatch = line.match(/(?:class|interface|abstract|enum)\s+"?(\w+)"?/);
        if (!nameMatch) return null;
        
        const classObj = {
            name: nameMatch[1],
            type: type,
            attributes: [],
            methods: []
        };
        
        // Check if class has body
        if (line.includes('{')) {
            let i = startIndex + 1;
            while (i < lines.length && !lines[i].startsWith('}')) {
                const memberLine = lines[i].trim();
                if (memberLine && memberLine !== '{') {
                    const member = this.parseMember(memberLine);
                    if (member) {
                        if (member.isMethod) {
                            classObj.methods.push(member);
                        } else {
                            classObj.attributes.push(member);
                        }
                    }
                }
                i++;
            }
            return { classObj, endIndex: i };
        }
        
        return { classObj, endIndex: startIndex };
    }

    parseMember(line) {
        // Remove leading symbols like -, +, #, ~
        const visibilityMatch = line.match(/^([+\-#~])\s*/);
        const visibility = visibilityMatch ? visibilityMatch[1] : '+';
        const content = line.replace(/^[+\-#~]\s*/, '').trim();
        
        // Check if it's a method (contains parentheses)
        const isMethod = content.includes('(');
        
        // Parse name and type
        let name, type;
        if (content.includes(':')) {
            const parts = content.split(':');
            name = parts[0].trim();
            type = parts[1].trim();
        } else {
            name = content;
            type = '';
        }
        
        return {
            visibility,
            name,
            type,
            isMethod
        };
    }

    parseRelation(line) {
        // Various relation patterns
        const patterns = [
            // Inheritance: A <|-- B or A --|> B
            { regex: /(\w+)\s*<\|[-.]+(.*?)(\w+)/, type: 'extends', from: 3, to: 1 },
            { regex: /(\w+)\s*[-.]+(.*?)\|>\s*(\w+)/, type: 'extends', from: 1, to: 3 },
            // Implementation: A <|.. B
            { regex: /(\w+)\s*<\|\.\.+(.*?)(\w+)/, type: 'implements', from: 3, to: 1 },
            { regex: /(\w+)\s*\.\.+(.*?)\|>\s*(\w+)/, type: 'implements', from: 1, to: 3 },
            // Composition: A *-- B
            { regex: /(\w+)\s*\*[-.]+(.*?)(\w+)/, type: 'composition', from: 1, to: 3 },
            { regex: /(\w+)\s*[-.]+(.*?)\*\s*(\w+)/, type: 'composition', from: 3, to: 1 },
            // Aggregation: A o-- B
            { regex: /(\w+)\s*o[-.]+(.*?)(\w+)/, type: 'aggregation', from: 1, to: 3 },
            { regex: /(\w+)\s*[-.]+(.*?)o\s*(\w+)/, type: 'aggregation', from: 3, to: 1 },
            // Association with arrow: A --> B or A ..> B
            { regex: /(\w+)\s*[-]+>\s*(\w+)(?:\s*:\s*(.+))?/, type: 'association', from: 1, to: 2, label: 3 },
            { regex: /(\w+)\s*\.+>\s*(\w+)(?:\s*:\s*(.+))?/, type: 'dependency', from: 1, to: 2, label: 3 },
            // Simple association: A -- B or A .. B
            { regex: /(\w+)\s*--\s*(\w+)(?:\s*:\s*(.+))?/, type: 'association', from: 1, to: 2, label: 3 },
            { regex: /(\w+)\s*\.\.\s*(\w+)(?:\s*:\s*(.+))?/, type: 'dependency', from: 1, to: 2, label: 3 },
        ];
        
        for (const pattern of patterns) {
            const match = line.match(pattern.regex);
            if (match) {
                return {
                    from: match[pattern.from],
                    to: match[pattern.to],
                    type: pattern.type,
                    label: pattern.label ? (match[pattern.label] || '').trim() : ''
                };
            }
        }
        
        return null;
    }
}

class DrawioGenerator {
    constructor(parsedData) {
        this.data = parsedData;
        this.nodePositions = new Map();
        this.cellId = 2;
    }

    generate() {
        if (this.data.type === 'activity') {
            return this.generateActivityDiagram();
        }
        const nodes = this.generateNodes();
        const edges = this.generateEdges();
        
        return this.wrapInDrawioFormat(nodes + edges);
    }

    generateActivityDiagram() {
        let xml = '';
        let y = 40;
        const x = 200;
        const spacing = 80;
        
        for (const activity of this.data.activities) {
            const id = this.cellId++;
            this.nodePositions.set(activity.id, { id, x, y });
            
            switch (activity.type) {
                case 'start':
                    xml += `        <mxCell id="${id}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;strokeColor=#000000;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="30" height="30" as="geometry"/>
        </mxCell>\n`;
                    y += 50;
                    break;
                    
                case 'end':
                    xml += `        <mxCell id="${id}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;strokeColor=#000000;strokeWidth=3;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="30" height="30" as="geometry"/>
        </mxCell>\n`;
                    const outerId = this.cellId++;
                    xml += `        <mxCell id="${outerId}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=none;strokeColor=#000000;strokeWidth=2;" vertex="1" parent="1">
          <mxGeometry x="${x - 5}" y="${y - 5}" width="40" height="40" as="geometry"/>
        </mxCell>\n`;
                    y += 60;
                    break;
                    
                case 'action':
                    const width = Math.max(140, activity.label.length * 8 + 20);
                    xml += `        <mxCell id="${id}" value="${this.escapeXml(activity.label)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${x - width/2 + 15}" y="${y}" width="${width}" height="40" as="geometry"/>
        </mxCell>\n`;
                    
                    // Add note if exists
                    if (activity.note) {
                        const noteId = this.cellId++;
                        xml += `        <mxCell id="${noteId}" value="${this.escapeXml(activity.note)}" style="shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;darkOpacity=0.05;fillColor=#fff2cc;strokeColor=#d6b656;size=14;align=left;spacingLeft=5;" vertex="1" parent="1">
          <mxGeometry x="${x + width/2 + 40}" y="${y - 10}" width="160" height="80" as="geometry"/>
        </mxCell>\n`;
                    }
                    y += spacing;
                    break;
                    
                case 'decision':
                    xml += `        <mxCell id="${id}" value="${this.escapeXml(activity.label)}" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="${x - 50 + 15}" y="${y}" width="100" height="60" as="geometry"/>
        </mxCell>\n`;
                    y += 90;
                    break;
                    
                case 'merge':
                    xml += `        <mxCell id="${id}" value="" style="rhombus;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;" vertex="1" parent="1">
          <mxGeometry x="${x - 15 + 15}" y="${y}" width="30" height="30" as="geometry"/>
        </mxCell>\n`;
                    y += 50;
                    break;
            }
        }
        
        // Generate edges
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            
            if (source && target) {
                const id = this.cellId++;
                const sourceActivity = this.data.activities.find(a => a.id === rel.from);
                let label = rel.label || '';
                if (sourceActivity && sourceActivity.type === 'decision') {
                    label = sourceActivity.yesBranch || '';
                }
                
                xml += `        <mxCell id="${id}" value="${this.escapeXml(label)}" style="endArrow=classic;html=1;rounded=0;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="${source.id}" target="${target.id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
            }
        }
        
        return this.wrapInDrawioFormat(xml);
    }

    generateNodes() {
        let xml = '';
        let x = 40, y = 40;
        const spacing = 200;
        const maxPerRow = 4;
        let count = 0;
        
        // Generate class nodes
        for (const cls of this.data.classes) {
            const id = this.cellId++;
            this.nodePositions.set(cls.name, { id, x, y });
            
            const height = 60 + (cls.attributes.length + cls.methods.length) * 20;
            const width = 160;
            
            // Class header
            const fillColor = cls.type === 'interface' ? '#d5e8d4' : 
                             cls.type === 'abstract' ? '#fff2cc' : 
                             cls.type === 'enum' ? '#e1d5e7' : '#dae8fc';
            const strokeColor = cls.type === 'interface' ? '#82b366' : 
                               cls.type === 'abstract' ? '#d6b656' : 
                               cls.type === 'enum' ? '#9673a6' : '#6c8ebf';
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(cls.name)}" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;fillColor=${fillColor};strokeColor=${strokeColor};" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>\n`;
            
            let memberY = 26;
            
            // Attributes
            for (const attr of cls.attributes) {
                const attrId = this.cellId++;
                const visibility = this.getVisibilitySymbol(attr.visibility);
                const value = `${visibility} ${attr.name}${attr.type ? ': ' + attr.type : ''}`;
                xml += `        <mxCell id="${attrId}" value="${this.escapeXml(value)}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="${id}">
          <mxGeometry y="${memberY}" width="${width}" height="20" as="geometry"/>
        </mxCell>\n`;
                memberY += 20;
            }
            
            // Separator
            if (cls.attributes.length > 0 && cls.methods.length > 0) {
                const sepId = this.cellId++;
                xml += `        <mxCell id="${sepId}" value="" style="line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;" vertex="1" parent="${id}">
          <mxGeometry y="${memberY}" width="${width}" height="8" as="geometry"/>
        </mxCell>\n`;
                memberY += 8;
            }
            
            // Methods
            for (const method of cls.methods) {
                const methodId = this.cellId++;
                const visibility = this.getVisibilitySymbol(method.visibility);
                const value = `${visibility} ${method.name}${method.type ? ': ' + method.type : ''}`;
                xml += `        <mxCell id="${methodId}" value="${this.escapeXml(value)}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="${id}">
          <mxGeometry y="${memberY}" width="${width}" height="20" as="geometry"/>
        </mxCell>\n`;
                memberY += 20;
            }
            
            count++;
            if (count % maxPerRow === 0) {
                x = 40;
                y += height + 60;
            } else {
                x += spacing;
            }
        }
        
        // Generate actor nodes
        for (const actor of this.data.actors) {
            const id = this.cellId++;
            this.nodePositions.set(actor.name, { id, x, y });
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(actor.label)}" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="30" height="60" as="geometry"/>
        </mxCell>\n`;
            
            count++;
            if (count % maxPerRow === 0) { x = 40; y += 120; } else { x += spacing; }
        }
        
        // Generate usecase nodes
        for (const uc of this.data.usecases) {
            const id = this.cellId++;
            this.nodePositions.set(uc.name, { id, x, y });
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(uc.label)}" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/>
        </mxCell>\n`;
            
            count++;
            if (count % maxPerRow === 0) { x = 40; y += 100; } else { x += spacing; }
        }
        
        // Generate component nodes
        for (const comp of this.data.components) {
            const id = this.cellId++;
            this.nodePositions.set(comp.name, { id, x, y });
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(comp.label)}" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/>
        </mxCell>\n`;
            
            count++;
            if (count % maxPerRow === 0) { x = 40; y += 100; } else { x += spacing; }
        }
        
        // Generate state nodes
        for (const node of this.data.nodes) {
            const id = this.cellId++;
            this.nodePositions.set(node.name, { id, x, y });
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(node.label)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/>
        </mxCell>\n`;
            
            count++;
            if (count % maxPerRow === 0) { x = 40; y += 100; } else { x += spacing; }
        }
        
        return xml;
    }

    generateEdges() {
        let xml = '';
        
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            
            if (!source || !target) continue;
            
            const id = this.cellId++;
            let style = this.getEdgeStyle(rel.type);
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(rel.label || '')}" style="${style}" edge="1" parent="1" source="${source.id}" target="${target.id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
        }
        
        return xml;
    }

    getEdgeStyle(type) {
        const styles = {
            'extends': 'endArrow=block;endSize=16;endFill=0;html=1;rounded=0;',
            'implements': 'endArrow=block;endSize=16;endFill=0;html=1;rounded=0;dashed=1;',
            'composition': 'endArrow=diamondThin;endFill=1;endSize=24;html=1;rounded=0;',
            'aggregation': 'endArrow=diamondThin;endFill=0;endSize=24;html=1;rounded=0;',
            'association': 'endArrow=open;endSize=12;html=1;rounded=0;',
            'dependency': 'endArrow=open;endSize=12;html=1;rounded=0;dashed=1;'
        };
        return styles[type] || styles['association'];
    }

    getVisibilitySymbol(visibility) {
        const symbols = { '+': '+', '-': '-', '#': '#', '~': '~' };
        return symbols[visibility] || '+';
    }

    escapeXml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    wrapInDrawioFormat(content) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="PlantUML-to-Drawio-Converter" modified="${new Date().toISOString()}" agent="PlantUML-Converter" version="1.0">
  <diagram name="Page-1" id="diagram-1">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${content}      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
    }
}

class PreviewRenderer {
    constructor(parsedData) {
        this.data = parsedData;
        this.nodePositions = new Map();
    }

    render() {
        if (this.data.type === 'activity') {
            return this.renderActivityDiagram();
        }
        
        let x = 50, y = 50;
        const spacing = 200;
        const maxPerRow = 3;
        let count = 0;
        let svgContent = '';
        
        // Calculate positions and render classes
        for (const cls of this.data.classes) {
            const height = 60 + (cls.attributes.length + cls.methods.length) * 18;
            const width = 150;
            
            this.nodePositions.set(cls.name, { x: x + width/2, y: y + height/2, width, height });
            
            const fillColor = cls.type === 'interface' ? '#d5e8d4' : 
                             cls.type === 'abstract' ? '#fff2cc' : '#dae8fc';
            
            svgContent += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" fill="${fillColor}" stroke="#6c8ebf" stroke-width="2"/>`;
            svgContent += `<rect x="${x}" y="${y}" width="${width}" height="25" rx="3" fill="${fillColor}" stroke="#6c8ebf" stroke-width="2"/>`;
            svgContent += `<text x="${x + width/2}" y="${y + 17}" class="label" text-anchor="middle" font-weight="bold">${this.escapeXml(cls.name)}</text>`;
            
            let memberY = y + 40;
            for (const attr of cls.attributes) {
                const vis = attr.visibility === '-' ? '-' : '+';
                svgContent += `<text x="${x + 8}" y="${memberY}" class="label">${vis} ${this.escapeXml(attr.name)}</text>`;
                memberY += 18;
            }
            for (const method of cls.methods) {
                const vis = method.visibility === '-' ? '-' : '+';
                svgContent += `<text x="${x + 8}" y="${memberY}" class="label">${vis} ${this.escapeXml(method.name)}</text>`;
                memberY += 18;
            }
            
            count++;
            if (count % maxPerRow === 0) {
                x = 50;
                y += height + 60;
            } else {
                x += spacing;
            }
        }
        
        // Render other node types similarly
        for (const actor of this.data.actors) {
            this.nodePositions.set(actor.name, { x: x + 15, y: y + 30, width: 30, height: 60 });
            svgContent += `<circle cx="${x + 15}" cy="${y + 10}" r="10" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            svgContent += `<line x1="${x + 15}" y1="${y + 20}" x2="${x + 15}" y2="${y + 40}" stroke="#6c8ebf" stroke-width="2"/>`;
            svgContent += `<line x1="${x}" y1="${y + 28}" x2="${x + 30}" y2="${y + 28}" stroke="#6c8ebf" stroke-width="2"/>`;
            svgContent += `<line x1="${x + 15}" y1="${y + 40}" x2="${x + 5}" y2="${y + 55}" stroke="#6c8ebf" stroke-width="2"/>`;
            svgContent += `<line x1="${x + 15}" y1="${y + 40}" x2="${x + 25}" y2="${y + 55}" stroke="#6c8ebf" stroke-width="2"/>`;
            svgContent += `<text x="${x + 15}" y="${y + 70}" class="label" text-anchor="middle">${this.escapeXml(actor.label)}</text>`;
            count++;
            if (count % maxPerRow === 0) { x = 50; y += 100; } else { x += spacing; }
        }
        
        for (const uc of this.data.usecases) {
            this.nodePositions.set(uc.name, { x: x + 60, y: y + 25, width: 120, height: 50 });
            svgContent += `<ellipse cx="${x + 60}" cy="${y + 25}" rx="60" ry="25" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            svgContent += `<text x="${x + 60}" y="${y + 30}" class="label" text-anchor="middle">${this.escapeXml(uc.label)}</text>`;
            count++;
            if (count % maxPerRow === 0) { x = 50; y += 80; } else { x += spacing; }
        }
        
        // Render edges
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            
            if (!source || !target) continue;
            
            const isDashed = rel.type === 'implements' || rel.type === 'dependency';
            const dashStyle = isDashed ? 'stroke-dasharray="5,5"' : '';
            
            svgContent += `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" class="edge" ${dashStyle} marker-end="url(#arrow)"/>`;
            
            if (rel.label) {
                const midX = (source.x + target.x) / 2;
                const midY = (source.y + target.y) / 2;
                svgContent += `<text x="${midX}" y="${midY - 5}" class="label" text-anchor="middle">${this.escapeXml(rel.label)}</text>`;
            }
        }
        
        const maxX = Math.max(...Array.from(this.nodePositions.values()).map(p => p.x + 100), 400);
        const maxY = Math.max(...Array.from(this.nodePositions.values()).map(p => p.y + 100), 300);
        
        return `<svg width="${maxX}" height="${maxY}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill="#666"/>
                </marker>
            </defs>
            ${svgContent}
        </svg>`;
    }

    escapeXml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    renderActivityDiagram() {
        let svgContent = '';
        let y = 30;
        const x = 200;
        const spacing = 70;
        
        for (const activity of this.data.activities) {
            this.nodePositions.set(activity.id, { x, y });
            
            switch (activity.type) {
                case 'start':
                    svgContent += `<circle cx="${x}" cy="${y}" r="15" fill="#333" stroke="#333" stroke-width="2"/>`;
                    y += 50;
                    break;
                    
                case 'end':
                    svgContent += `<circle cx="${x}" cy="${y}" r="12" fill="#333" stroke="#333" stroke-width="2"/>`;
                    svgContent += `<circle cx="${x}" cy="${y}" r="18" fill="none" stroke="#333" stroke-width="2"/>`;
                    y += 50;
                    break;
                    
                case 'action':
                    const width = Math.max(120, activity.label.length * 7 + 20);
                    svgContent += `<rect x="${x - width/2}" y="${y - 15}" width="${width}" height="30" rx="10" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
                    svgContent += `<text x="${x}" y="${y + 5}" class="label" text-anchor="middle">${this.escapeXml(activity.label)}</text>`;
                    
                    if (activity.note) {
                        svgContent += `<rect x="${x + width/2 + 20}" y="${y - 25}" width="140" height="60" fill="#fff2cc" stroke="#d6b656" stroke-width="1"/>`;
                        const noteLines = activity.note.split('\n').slice(0, 3);
                        noteLines.forEach((line, i) => {
                            svgContent += `<text x="${x + width/2 + 28}" y="${y - 10 + i * 14}" font-size="10" fill="#666">${this.escapeXml(line.substring(0, 20))}</text>`;
                        });
                    }
                    y += spacing;
                    break;
                    
                case 'decision':
                    svgContent += `<polygon points="${x},${y - 25} ${x + 40},${y} ${x},${y + 25} ${x - 40},${y}" fill="#fff2cc" stroke="#d6b656" stroke-width="2"/>`;
                    svgContent += `<text x="${x}" y="${y + 4}" class="label" text-anchor="middle" font-size="10">${this.escapeXml(activity.label.substring(0, 15))}</text>`;
                    y += spacing;
                    break;
                    
                case 'merge':
                    svgContent += `<polygon points="${x},${y - 10} ${x + 15},${y} ${x},${y + 10} ${x - 15},${y}" fill="#f5f5f5" stroke="#666" stroke-width="2"/>`;
                    y += 40;
                    break;
            }
        }
        
        // Draw edges
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            
            if (source && target) {
                const sourceActivity = this.data.activities.find(a => a.id === rel.from);
                let startY = source.y + 15;
                if (sourceActivity) {
                    if (sourceActivity.type === 'action') startY = source.y + 15;
                    else if (sourceActivity.type === 'decision') startY = source.y + 25;
                    else if (sourceActivity.type === 'merge') startY = source.y + 10;
                }
                
                svgContent += `<line x1="${source.x}" y1="${startY}" x2="${target.x}" y2="${target.y - 15}" stroke="#666" stroke-width="1.5" marker-end="url(#arrow)"/>`;
            }
        }
        
        const maxY = Math.max(...Array.from(this.nodePositions.values()).map(p => p.y + 50), 200);
        
        return `<svg width="500" height="${maxY}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill="#666"/>
                </marker>
            </defs>
            ${svgContent}
        </svg>`;
    }
}

// Main functions
function convert() {
    const input = document.getElementById('plantuml-input').value.trim();
    const outputEl = document.getElementById('drawio-output');
    const statusEl = document.getElementById('status');
    const previewEl = document.getElementById('preview');
    
    if (!input) {
        showStatus('Please enter PlantUML code', 'error');
        return;
    }
    
    try {
        const parser = new PlantUMLParser(input);
        const parsed = parser.parse();
        
        if (parsed.classes.length === 0 && parsed.actors.length === 0 && 
            parsed.usecases.length === 0 && parsed.components.length === 0 &&
            parsed.nodes.length === 0 && (!parsed.activities || parsed.activities.length === 0)) {
            showStatus('No valid elements found in PlantUML code', 'error');
            return;
        }
        
        const generator = new DrawioGenerator(parsed);
        const drawioXml = generator.generate();
        outputEl.value = drawioXml;
        
        const renderer = new PreviewRenderer(parsed);
        previewEl.innerHTML = renderer.render();
        
        const totalElements = parsed.classes.length + parsed.actors.length + 
                             parsed.usecases.length + parsed.components.length + parsed.nodes.length +
                             (parsed.activities ? parsed.activities.length : 0);
        showStatus(`Successfully converted! Found ${totalElements} elements and ${parsed.relations.length} relations.`, 'success');
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        console.error(error);
    }
}

function downloadDrawio() {
    const output = document.getElementById('drawio-output').value;
    if (!output) {
        showStatus('Please convert PlantUML first', 'error');
        return;
    }
    
    const blob = new Blob([output], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.drawio';
    a.click();
    URL.revokeObjectURL(url);
    showStatus('File downloaded!', 'success');
}

function copyOutput() {
    const output = document.getElementById('drawio-output');
    output.select();
    document.execCommand('copy');
    showStatus('Copied to clipboard!', 'success');
}

function clearAll() {
    document.getElementById('plantuml-input').value = '';
    document.getElementById('drawio-output').value = '';
    document.getElementById('preview').innerHTML = '';
    document.getElementById('status').className = 'status';
}

function loadExample() {
    document.getElementById('plantuml-input').value = `@startuml
class User {
  +id: int
  +name: string
  +email: string
  -password: string
  +login()
  +logout()
  +register()
}

class Order {
  +id: int
  +date: datetime
  +total: decimal
  +status: string
  +process()
  +cancel()
}

class Product {
  +id: int
  +name: string
  +price: decimal
  +stock: int
  +updateStock()
}

class OrderItem {
  +quantity: int
  +subtotal: decimal
}

class ShoppingCart {
  +items: list
  +addItem()
  +removeItem()
  +checkout()
}

User --> Order : creates
User --> ShoppingCart : has
Order *-- OrderItem : contains
OrderItem --> Product : references
ShoppingCart --> Product : contains
@enduml`;
    convert();
}

function showStatus(message, type) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
}
