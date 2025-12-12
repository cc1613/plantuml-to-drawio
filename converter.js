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
        this.sequences = [];
        this.participants = [];
        this.states = [];
        this.mindmap = [];
        this.entities = [];
        this.deployments = [];
        this.swimlanes = [];
        this.partitions = [];
        this.diagramType = 'class';
    }

    parse() {
        const lines = this.input.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith("'"));
        
        this.diagramType = this.detectDiagramType(lines);
        
        switch (this.diagramType) {
            case 'activity':
                return this.parseActivityDiagram(lines);
            case 'sequence':
                return this.parseSequenceDiagram(lines);
            case 'state':
                return this.parseStateDiagram(lines);
            case 'mindmap':
                return this.parseMindMap(lines);
            case 'er':
                return this.parseERDiagram(lines);
            case 'deployment':
                return this.parseDeploymentDiagram(lines);
            default:
                return this.parseClassDiagram(lines);
        }
    }

    detectDiagramType(lines) {
        const input = this.input.toLowerCase();
        
        if (input.includes('->') && (input.includes('participant') || 
            lines.some(l => /^\w+\s*->>?\s*\w+\s*:/.test(l)))) {
            return 'sequence';
        }
        
        if ((input.includes('start') && (input.includes('stop') || input.includes('end'))) && 
            (lines.some(l => /^:.*;\s*$/.test(l)) || input.includes('if ('))) {
            return 'activity';
        }
        
        if (input.includes('@startuml') && (input.includes('[*]') || 
            lines.some(l => l.startsWith('state ')))) {
            return 'state';
        }
        
        if (input.includes('@startmindmap')) {
            return 'mindmap';
        }
        
        if (input.includes('entity ') || input.includes('}|') || input.includes('|{')) {
            return 'er';
        }
        
        if (input.includes('database ') || input.includes('cloud ') || input.includes('artifact ')) {
            return 'deployment';
        }
        
        return 'class';
    }

    // ==================== Activity Diagram with Swimlanes ====================
    parseActivityDiagram(lines) {
        const activities = [];
        const edges = [];
        const swimlanes = [];
        const partitions = [];
        let nodeId = 0;
        let stack = [];
        let noteBuffer = [];
        let inNote = false;
        let currentSwimlane = null;
        let currentPartition = null;
        let swimlaneMap = new Map();
        let inPartition = false;
        let partitionStack = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
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

            // Swimlane: |SwimlaneLabel| or |#color|SwimlaneLabel|
            const swimlaneMatch = line.match(/^\|(?:#(\w+)\|)?([^|]+)\|$/);
            if (swimlaneMatch) {
                const color = swimlaneMatch[1] || null;
                const label = swimlaneMatch[2].trim();
                
                if (!swimlaneMap.has(label)) {
                    const swimlane = { 
                        id: swimlanes.length, 
                        label, 
                        color,
                        startIndex: activities.length 
                    };
                    swimlanes.push(swimlane);
                    swimlaneMap.set(label, swimlane);
                }
                currentSwimlane = swimlaneMap.get(label);
                continue;
            }

            // Partition start: partition "Label" { or partition Label {
            const partitionStartMatch = line.match(/^partition\s+"?([^"{]+)"?\s*\{?$/);
            if (partitionStartMatch) {
                const partition = {
                    id: partitions.length,
                    label: partitionStartMatch[1].trim(),
                    startIndex: activities.length,
                    endIndex: -1
                };
                partitions.push(partition);
                partitionStack.push(partition);
                currentPartition = partition;
                inPartition = true;
                continue;
            }

            // Partition end: }
            if (line === '}' && partitionStack.length > 0) {
                const finishedPartition = partitionStack.pop();
                finishedPartition.endIndex = activities.length;
                currentPartition = partitionStack.length > 0 ? partitionStack[partitionStack.length - 1] : null;
                inPartition = partitionStack.length > 0;
                continue;
            }
            
            // Start node
            if (line === 'start') {
                activities.push({ 
                    id: nodeId++, 
                    type: 'start', 
                    label: 'Start',
                    swimlane: currentSwimlane ? currentSwimlane.id : null,
                    partition: currentPartition ? currentPartition.id : null
                });
                continue;
            }
            
            // Stop/End node
            if (line === 'stop' || line === 'end') {
                activities.push({ 
                    id: nodeId++, 
                    type: 'end', 
                    label: 'End',
                    swimlane: currentSwimlane ? currentSwimlane.id : null,
                    partition: currentPartition ? currentPartition.id : null
                });
                continue;
            }

            // Fork/Join
            if (line === 'fork' || line === 'fork again' || line === 'end fork') {
                activities.push({ 
                    id: nodeId++, 
                    type: 'fork', 
                    label: '',
                    swimlane: currentSwimlane ? currentSwimlane.id : null,
                    partition: currentPartition ? currentPartition.id : null
                });
                continue;
            }
            
            // Activity :text;
            const activityMatch = line.match(/^:(.+);$/);
            if (activityMatch) {
                activities.push({ 
                    id: nodeId++, 
                    type: 'action', 
                    label: activityMatch[1].trim(),
                    swimlane: currentSwimlane ? currentSwimlane.id : null,
                    partition: currentPartition ? currentPartition.id : null
                });
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
                    yesBranch: ifMatch[2].trim(),
                    swimlane: currentSwimlane ? currentSwimlane.id : null,
                    partition: currentPartition ? currentPartition.id : null
                });
                stack.push({ type: 'if', id: conditionId, hasElse: false, elseLabel: '' });
                continue;
            }
            
            // Else branch
            const elseMatch = line.match(/^else\s*\((.+)\)$/);
            if (elseMatch && stack.length > 0) {
                const current = stack[stack.length - 1];
                current.hasElse = true;
                current.elseLabel = elseMatch[1].trim();
                current.elseStartIndex = activities.length;
                // Add marker for else branch
                activities.push({
                    id: nodeId++,
                    type: 'else_marker',
                    label: elseMatch[1].trim(),
                    relatedDecision: current.id,
                    swimlane: currentSwimlane ? currentSwimlane.id : null,
                    partition: currentPartition ? currentPartition.id : null
                });
                continue;
            }
            
            // Endif
            if (line === 'endif') {
                if (stack.length > 0) {
                    const finished = stack.pop();
                    activities.push({ 
                        id: nodeId++, 
                        type: 'merge', 
                        label: '', 
                        relatedDecision: finished.id,
                        swimlane: currentSwimlane ? currentSwimlane.id : null,
                        partition: currentPartition ? currentPartition.id : null
                    });
                }
                continue;
            }

            // While loop
            const whileMatch = line.match(/^while\s*\((.+)\)\s*(?:is\s*\((.+)\))?$/);
            if (whileMatch) {
                activities.push({ 
                    id: nodeId++, 
                    type: 'decision', 
                    label: whileMatch[1], 
                    yesBranch: whileMatch[2] || 'yes',
                    swimlane: currentSwimlane ? currentSwimlane.id : null,
                    partition: currentPartition ? currentPartition.id : null
                });
                continue;
            }

            if (line === 'endwhile' || line.match(/^endwhile\s*\(/)) {
                activities.push({ 
                    id: nodeId++, 
                    type: 'merge', 
                    label: '',
                    swimlane: currentSwimlane ? currentSwimlane.id : null,
                    partition: currentPartition ? currentPartition.id : null
                });
                continue;
            }
        }
        
        // Build edges - improved logic for handling branches
        this.buildActivityEdges(activities, edges);
        
        return {
            type: 'activity',
            activities,
            relations: edges,
            swimlanes,
            partitions,
            classes: [], actors: [], usecases: [], components: [], nodes: [], notes: []
        };
    }

    buildActivityEdges(activities, edges) {
        // Find decision-merge pairs and build proper edges
        const decisionMergeMap = new Map();
        
        // First pass: map merges to their decisions
        for (const act of activities) {
            if (act.type === 'merge' && act.relatedDecision !== undefined) {
                decisionMergeMap.set(act.relatedDecision, act.id);
            }
        }

        // Build edges with branch awareness
        for (let i = 0; i < activities.length - 1; i++) {
            const current = activities[i];
            const next = activities[i + 1];
            
            // Skip else_marker for regular flow
            if (current.type === 'else_marker') {
                continue;
            }
            
            // Skip merge nodes - they'll be connected from branches
            if (current.type === 'merge') {
                if (next && next.type !== 'end') {
                    edges.push({ from: current.id, to: next.id, label: '' });
                }
                continue;
            }

            // For decisions, connect to next (yes branch)
            if (current.type === 'decision') {
                edges.push({ from: current.id, to: next.id, label: current.yesBranch || '' });
                
                // Find else branch if exists
                for (let j = i + 1; j < activities.length; j++) {
                    if (activities[j].type === 'else_marker' && activities[j].relatedDecision === current.id) {
                        if (j + 1 < activities.length) {
                            edges.push({ from: current.id, to: activities[j + 1].id, label: activities[j].label });
                        }
                        break;
                    }
                }
                continue;
            }
            
            // Normal sequential connection
            if (next.type !== 'else_marker') {
                edges.push({ from: current.id, to: next.id, label: '' });
            } else {
                // Skip else_marker and find merge
                const mergeId = decisionMergeMap.get(next.relatedDecision);
                if (mergeId !== undefined) {
                    edges.push({ from: current.id, to: mergeId, label: '' });
                }
            }
        }
    }

    // ==================== Sequence Diagram ====================
    parseSequenceDiagram(lines) {
        const participants = [];
        const messages = [];
        const participantMap = new Map();
        let msgId = 0;

        for (const line of lines) {
            if (line.startsWith('@') || line.startsWith('!') || line.startsWith('skinparam') || 
                line.startsWith('title') || line.startsWith('hide')) continue;

            const participantMatch = line.match(/^(participant|actor)\s+"?([^"]+)"?\s*(?:as\s+(\w+))?/i);
            if (participantMatch) {
                const name = participantMatch[3] || participantMatch[2];
                const label = participantMatch[2];
                const type = participantMatch[1].toLowerCase();
                if (!participantMap.has(name)) {
                    participantMap.set(name, { name, label, type, order: participants.length });
                    participants.push({ name, label, type });
                }
                continue;
            }

            const messageMatch = line.match(/^(\w+)\s*([-<>\.]+)\s*(\w+)\s*:\s*(.*)$/);
            if (messageMatch) {
                const from = messageMatch[1];
                const arrow = messageMatch[2];
                const to = messageMatch[3];
                const text = messageMatch[4].trim();
                
                [from, to].forEach(p => {
                    if (!participantMap.has(p)) {
                        participantMap.set(p, { name: p, label: p, type: 'participant', order: participants.length });
                        participants.push({ name: p, label: p, type: 'participant' });
                    }
                });

                messages.push({
                    id: msgId++,
                    from, to, text,
                    isReturn: arrow.includes('<') || arrow.includes('--'),
                    isAsync: arrow.includes('>>'),
                    isDashed: arrow.includes('--') || arrow.includes('..')
                });
            }
        }

        return {
            type: 'sequence',
            participants, messages,
            notes: this.notes,
            classes: [], actors: [], usecases: [], components: [], nodes: [], activities: [], relations: []
        };
    }

    // ==================== State Diagram ====================
    parseStateDiagram(lines) {
        const states = [];
        const transitions = [];
        const stateMap = new Map();
        let stateId = 0;

        for (const line of lines) {
            if (line.startsWith('@') || line.startsWith('!') || line.startsWith('skinparam') || 
                line.startsWith('title') || line.startsWith('hide')) continue;

            const stateMatch = line.match(/^state\s+"([^"]+)"\s+as\s+(\w+)/);
            if (stateMatch) {
                if (!stateMap.has(stateMatch[2])) {
                    stateMap.set(stateMatch[2], { id: stateId++, name: stateMatch[2], label: stateMatch[1], type: 'state' });
                    states.push(stateMap.get(stateMatch[2]));
                }
                continue;
            }

            const simpleStateMatch = line.match(/^state\s+(\w+)(?:\s*{)?$/);
            if (simpleStateMatch) {
                if (!stateMap.has(simpleStateMatch[1])) {
                    stateMap.set(simpleStateMatch[1], { id: stateId++, name: simpleStateMatch[1], label: simpleStateMatch[1], type: 'state' });
                    states.push(stateMap.get(simpleStateMatch[1]));
                }
                continue;
            }

            const transMatch = line.match(/^(\[\*\]|\w+)\s*([-]+>)\s*(\[\*\]|\w+)(?:\s*:\s*(.+))?$/);
            if (transMatch) {
                const from = transMatch[1];
                const to = transMatch[3];
                const label = transMatch[4] || '';

                [from, to].forEach(s => {
                    if (s === '[*]') {
                        const key = from === '[*]' && to !== '[*]' ? '[*]_start' : '[*]_end';
                        if (!stateMap.has(key)) {
                            const isStart = from === '[*]' && to !== '[*]';
                            stateMap.set(key, { 
                                id: stateId++, name: s, 
                                label: isStart ? 'Start' : 'End', 
                                type: isStart ? 'start' : 'end' 
                            });
                            states.push(stateMap.get(key));
                        }
                    } else if (!stateMap.has(s)) {
                        stateMap.set(s, { id: stateId++, name: s, label: s, type: 'state' });
                        states.push(stateMap.get(s));
                    }
                });

                transitions.push({ from, to, label });
            }
        }

        return {
            type: 'state', states, transitions,
            classes: [], actors: [], usecases: [], components: [], nodes: [], activities: [], relations: [], notes: []
        };
    }

    // ==================== Mind Map ====================
    parseMindMap(lines) {
        const nodes = [];
        let nodeId = 0;
        let lastNodeByLevel = {};

        for (const line of lines) {
            if (line.startsWith('@') || line.startsWith('!') || line.startsWith('skinparam') || 
                line === '' || line.startsWith('title')) continue;

            const levelMatch = line.match(/^([+\-*]+)\s*(.+)$/);
            if (levelMatch) {
                const level = levelMatch[1].length;
                const text = levelMatch[2].trim();
                const isRight = levelMatch[1].includes('+');
                
                const node = {
                    id: nodeId++, text, level,
                    side: isRight ? 'right' : 'left',
                    parent: level > 1 ? lastNodeByLevel[level - 1] : null
                };
                
                nodes.push(node);
                lastNodeByLevel[level] = node.id;
            }
        }

        return {
            type: 'mindmap', mindmap: nodes,
            classes: [], actors: [], usecases: [], components: [], nodes: [], activities: [], relations: [], notes: []
        };
    }

    // ==================== ER Diagram ====================
    parseERDiagram(lines) {
        const entities = [];
        const relationships = [];
        const entityMap = new Map();
        let entityId = 0;
        let currentEntity = null;

        for (const line of lines) {
            if (line.startsWith('@') || line.startsWith('!') || line.startsWith('skinparam') || 
                line.startsWith('title') || line.startsWith('hide')) continue;

            const entityMatch = line.match(/^entity\s+"?([^"{\s]+)"?\s*(?:as\s+(\w+))?\s*{?$/);
            if (entityMatch) {
                const name = entityMatch[2] || entityMatch[1];
                currentEntity = { id: entityId++, name, label: entityMatch[1], attributes: [] };
                entityMap.set(name, currentEntity);
                entities.push(currentEntity);
                continue;
            }

            if (line === '}') { currentEntity = null; continue; }

            if (currentEntity && line && !line.includes('--') && !line.includes('..')) {
                const attrMatch = line.match(/^\*?\s*([^:]+)(?:\s*:\s*(.+))?$/);
                if (attrMatch) {
                    currentEntity.attributes.push({
                        name: attrMatch[1].replace('*', '').trim(),
                        type: attrMatch[2] || '',
                        isPrimaryKey: line.startsWith('*')
                    });
                }
                continue;
            }

            const relMatch = line.match(/^(\w+)\s*([|o{}\[\]]+[-\.]+[|o{}\[\]]+)\s*(\w+)(?:\s*:\s*(.+))?$/);
            if (relMatch) {
                [relMatch[1], relMatch[3]].forEach(e => {
                    if (!entityMap.has(e)) {
                        const ent = { id: entityId++, name: e, label: e, attributes: [] };
                        entityMap.set(e, ent);
                        entities.push(ent);
                    }
                });
                relationships.push({ 
                    from: relMatch[1], to: relMatch[3], 
                    label: relMatch[4] || '', 
                    fromCard: '1', toCard: 'n' 
                });
            }
        }

        return {
            type: 'er', entities, relationships,
            classes: [], actors: [], usecases: [], components: [], nodes: [], activities: [], relations: [], notes: []
        };
    }

    // ==================== Deployment Diagram ====================
    parseDeploymentDiagram(lines) {
        const deployments = [];
        const connections = [];
        const nodeMap = new Map();
        let nodeId = 0;

        for (const line of lines) {
            if (line.startsWith('@') || line.startsWith('!') || line.startsWith('skinparam') || 
                line.startsWith('title') || line.startsWith('hide')) continue;

            const nodeMatch = line.match(/^(node|database|cloud|artifact|folder|frame|package|rectangle|storage)\s+"?([^"{\s]+)"?\s*(?:as\s+(\w+))?\s*{?$/i);
            if (nodeMatch) {
                const type = nodeMatch[1].toLowerCase();
                const label = nodeMatch[2];
                const name = nodeMatch[3] || label;
                
                if (!nodeMap.has(name)) {
                    const node = { id: nodeId++, name, label, type };
                    nodeMap.set(name, node);
                    deployments.push(node);
                }
                continue;
            }

            const connMatch = line.match(/^(\w+)\s*([-\.]+>?)\s*(\w+)(?:\s*:\s*(.+))?$/);
            if (connMatch) {
                [connMatch[1], connMatch[3]].forEach(n => {
                    if (!nodeMap.has(n)) {
                        const node = { id: nodeId++, name: n, label: n, type: 'node' };
                        nodeMap.set(n, node);
                        deployments.push(node);
                    }
                });
                connections.push({ 
                    from: connMatch[1], to: connMatch[3], 
                    label: connMatch[4] || '', 
                    isDashed: connMatch[2].includes('.') 
                });
            }
        }

        return {
            type: 'deployment', deployments, connections,
            classes: [], actors: [], usecases: [], components: [], nodes: [], activities: [], relations: [], notes: []
        };
    }

    // ==================== Class Diagram ====================
    parseClassDiagram(lines) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('@startuml') || line.startsWith('@enduml')) continue;
            if (line.startsWith('skinparam') || line.startsWith('hide') || line.startsWith('show')) continue;
            
            if (line.startsWith('class ') || line.startsWith('interface ') || line.startsWith('abstract ') || line.startsWith('enum ')) {
                const classData = this.parseClass(lines, i);
                if (classData) {
                    this.classes.push(classData.classObj);
                    i = classData.endIndex;
                }
                continue;
            }
            
            if (line.startsWith('actor ')) {
                const match = line.match(/actor\s+"?([^"]+)"?\s*(?:as\s+(\w+))?/);
                if (match) this.actors.push({ name: match[2] || match[1], label: match[1] });
                continue;
            }
            
            if (line.startsWith('usecase ') || line.match(/^\(.*\)/)) {
                const match = line.match(/(?:usecase\s+)?"?([^"(]+)"?\s*(?:as\s+)?(\w+)?/) || 
                              line.match(/\(([^)]+)\)\s*(?:as\s+(\w+))?/);
                if (match) this.usecases.push({ name: match[2] || match[1], label: match[1] });
                continue;
            }
            
            if (line.startsWith('component ') || line.startsWith('[')) {
                const match = line.match(/(?:component\s+)?"?([^"\[\]]+)"?\s*(?:as\s+(\w+))?/) ||
                              line.match(/\[([^\]]+)\]\s*(?:as\s+(\w+))?/);
                if (match) this.components.push({ name: match[2] || match[1], label: match[1] });
                continue;
            }
            
            const relation = this.parseRelation(line);
            if (relation) this.relations.push(relation);
        }
        
        return {
            type: this.diagramType,
            classes: this.classes, relations: this.relations, actors: this.actors,
            usecases: this.usecases, components: this.components, nodes: this.nodes,
            notes: this.notes, activities: this.activities
        };
    }

    parseClass(lines, startIndex) {
        const line = lines[startIndex];
        const typeMatch = line.match(/^(class|interface|abstract|enum)\s+/);
        const type = typeMatch ? typeMatch[1] : 'class';
        
        const nameMatch = line.match(/(?:class|interface|abstract|enum)\s+"?([^"{\s]+)"?/);
        if (!nameMatch) return null;
        
        const classObj = { name: nameMatch[1], type, attributes: [], methods: [] };
        
        if (line.includes('{')) {
            let i = startIndex + 1;
            while (i < lines.length && !lines[i].startsWith('}')) {
                const memberLine = lines[i].trim();
                if (memberLine && memberLine !== '{') {
                    const member = this.parseMember(memberLine);
                    if (member) {
                        if (member.isMethod) classObj.methods.push(member);
                        else classObj.attributes.push(member);
                    }
                }
                i++;
            }
            return { classObj, endIndex: i };
        }
        return { classObj, endIndex: startIndex };
    }

    parseMember(line) {
        const visibilityMatch = line.match(/^([+\-#~])\s*/);
        const visibility = visibilityMatch ? visibilityMatch[1] : '+';
        const content = line.replace(/^[+\-#~]\s*/, '').trim();
        const isMethod = content.includes('(');
        
        let name, type;
        if (content.includes(':')) {
            const parts = content.split(':');
            name = parts[0].trim();
            type = parts[1].trim();
        } else {
            name = content;
            type = '';
        }
        return { visibility, name, type, isMethod };
    }

    parseRelation(line) {
        const patterns = [
            { regex: /(\w+)\s*<\|[-.]+(.*?)(\w+)/, type: 'extends', from: 3, to: 1 },
            { regex: /(\w+)\s*[-.]+(.*?)\|>\s*(\w+)/, type: 'extends', from: 1, to: 3 },
            { regex: /(\w+)\s*<\|\.\.+(.*?)(\w+)/, type: 'implements', from: 3, to: 1 },
            { regex: /(\w+)\s*\*[-.]+(.*?)(\w+)/, type: 'composition', from: 1, to: 3 },
            { regex: /(\w+)\s*o[-.]+(.*?)(\w+)/, type: 'aggregation', from: 1, to: 3 },
            { regex: /(\w+)\s*[-]+>\s*(\w+)(?:\s*:\s*(.+))?/, type: 'association', from: 1, to: 2, label: 3 },
            { regex: /(\w+)\s*\.+>\s*(\w+)(?:\s*:\s*(.+))?/, type: 'dependency', from: 1, to: 2, label: 3 },
            { regex: /(\w+)\s*--\s*(\w+)(?:\s*:\s*(.+))?/, type: 'association', from: 1, to: 2, label: 3 },
        ];
        
        for (const pattern of patterns) {
            const match = line.match(pattern.regex);
            if (match) {
                return {
                    from: match[pattern.from], to: match[pattern.to],
                    type: pattern.type,
                    label: pattern.label ? (match[pattern.label] || '').trim() : ''
                };
            }
        }
        return null;
    }
}

// ==================== Draw.io Generator ====================
class DrawioGenerator {
    constructor(parsedData) {
        this.data = parsedData;
        this.nodePositions = new Map();
        this.cellId = 2;
    }

    generate() {
        let xml = '';
        switch (this.data.type) {
            case 'activity':
                xml = this.generateActivityDiagram();
                break;
            case 'sequence':
                xml = this.generateSequenceDiagram();
                break;
            case 'state':
                xml = this.generateStateDiagram();
                break;
            case 'mindmap':
                xml = this.generateMindMap();
                break;
            case 'er':
                xml = this.generateERDiagram();
                break;
            case 'deployment':
                xml = this.generateDeploymentDiagram();
                break;
            default:
                xml = this.generateNodes() + this.generateEdges();
        }
        return this.wrapInDrawioFormat(xml);
    }

    // ==================== Activity Diagram with Swimlanes ====================
    generateActivityDiagram() {
        let xml = '';
        const hasSwimlanes = this.data.swimlanes && this.data.swimlanes.length > 0;
        const hasPartitions = this.data.partitions && this.data.partitions.length > 0;
        
        // Calculate layout
        const swimlaneWidth = 250;
        const nodeWidth = 140;
        const nodeHeight = 40;
        const spacing = 70;
        let startY = 40;
        
        // Generate swimlanes if present
        if (hasSwimlanes) {
            let swimlaneX = 20;
            const swimlaneHeight = 100 + this.data.activities.length * spacing;
            
            for (const swimlane of this.data.swimlanes) {
                const id = this.cellId++;
                const color = swimlane.color || 'none';
                const fillColor = color !== 'none' ? color : '#f5f5f5';
                
                xml += `        <mxCell id="${id}" value="${this.escapeXml(swimlane.label)}" style="swimlane;horizontal=0;whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=#666666;startSize=30;" vertex="1" parent="1">
          <mxGeometry x="${swimlaneX}" y="${startY}" width="${swimlaneWidth}" height="${swimlaneHeight}" as="geometry"/>
        </mxCell>\n`;
                
                swimlane.cellId = id;
                swimlane.x = swimlaneX;
                swimlaneX += swimlaneWidth;
            }
            startY += 50;
        }
        
        // Calculate Y positions for activities
        let yPositions = new Map();
        let currentY = startY;
        
        for (const activity of this.data.activities) {
            if (activity.type === 'else_marker') continue;
            yPositions.set(activity.id, currentY);
            
            if (activity.type === 'start' || activity.type === 'end') {
                currentY += 50;
            } else if (activity.type === 'decision') {
                currentY += 80;
            } else if (activity.type === 'merge' || activity.type === 'fork') {
                currentY += 40;
            } else {
                currentY += spacing;
            }
        }
        
        // Generate partition backgrounds if present
        if (hasPartitions) {
            for (const partition of this.data.partitions) {
                const partitionId = this.cellId++;
                const startAct = this.data.activities[partition.startIndex];
                const endAct = this.data.activities[Math.min(partition.endIndex, this.data.activities.length - 1)];
                
                if (startAct && endAct) {
                    const pStartY = yPositions.get(startAct.id) - 20;
                    const pEndY = yPositions.get(endAct.id) + 60;
                    const pHeight = pEndY - pStartY;
                    
                    xml += `        <mxCell id="${partitionId}" value="${this.escapeXml(partition.label)}" style="swimlane;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;startSize=25;horizontal=1;" vertex="1" parent="1">
          <mxGeometry x="30" y="${pStartY}" width="${hasSwimlanes ? swimlaneWidth * this.data.swimlanes.length : 300}" height="${pHeight}" as="geometry"/>
        </mxCell>\n`;
                }
            }
        }
        
        // Generate activity nodes
        for (const activity of this.data.activities) {
            if (activity.type === 'else_marker') continue;
            
            const id = this.cellId++;
            const y = yPositions.get(activity.id);
            
            // Calculate X based on swimlane
            let x = 150;
            if (hasSwimlanes && activity.swimlane !== null) {
                const swimlane = this.data.swimlanes[activity.swimlane];
                if (swimlane) {
                    x = swimlane.x + swimlaneWidth / 2 - nodeWidth / 2 + 30;
                }
            }
            
            this.nodePositions.set(activity.id, { id, x: x + nodeWidth/2, y: y + nodeHeight/2 });
            
            switch (activity.type) {
                case 'start':
                    xml += `        <mxCell id="${id}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;strokeColor=#000000;" vertex="1" parent="1">
          <mxGeometry x="${x + nodeWidth/2 - 15}" y="${y}" width="30" height="30" as="geometry"/>
        </mxCell>\n`;
                    break;
                    
                case 'end':
                    xml += `        <mxCell id="${id}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;strokeColor=#000000;strokeWidth=3;" vertex="1" parent="1">
          <mxGeometry x="${x + nodeWidth/2 - 15}" y="${y}" width="30" height="30" as="geometry"/>
        </mxCell>\n`;
                    const outerId = this.cellId++;
                    xml += `        <mxCell id="${outerId}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=none;strokeColor=#000000;strokeWidth=2;" vertex="1" parent="1">
          <mxGeometry x="${x + nodeWidth/2 - 20}" y="${y - 5}" width="40" height="40" as="geometry"/>
        </mxCell>\n`;
                    break;
                    
                case 'action':
                    const width = Math.max(nodeWidth, activity.label.length * 8 + 20);
                    xml += `        <mxCell id="${id}" value="${this.escapeXml(activity.label)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${nodeHeight}" as="geometry"/>
        </mxCell>\n`;
                    
                    if (activity.note) {
                        const noteId = this.cellId++;
                        xml += `        <mxCell id="${noteId}" value="${this.escapeXml(activity.note)}" style="shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;fillColor=#fff2cc;strokeColor=#d6b656;size=14;align=left;spacingLeft=5;fontSize=10;" vertex="1" parent="1">
          <mxGeometry x="${x + width + 20}" y="${y - 10}" width="140" height="60" as="geometry"/>
        </mxCell>\n`;
                    }
                    break;
                    
                case 'decision':
                    xml += `        <mxCell id="${id}" value="${this.escapeXml(activity.label)}" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="100" height="60" as="geometry"/>
        </mxCell>\n`;
                    break;
                    
                case 'merge':
                    xml += `        <mxCell id="${id}" value="" style="rhombus;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;" vertex="1" parent="1">
          <mxGeometry x="${x + nodeWidth/2 - 15}" y="${y}" width="30" height="30" as="geometry"/>
        </mxCell>\n`;
                    break;

                case 'fork':
                    xml += `        <mxCell id="${id}" value="" style="line;html=1;strokeWidth=4;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=#000000;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="100" height="10" as="geometry"/>
        </mxCell>\n`;
                    break;
            }
        }
        
        // Generate edges
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            
            if (source && target) {
                const id = this.cellId++;
                xml += `        <mxCell id="${id}" value="${this.escapeXml(rel.label || '')}" style="endArrow=classic;html=1;rounded=0;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${source.x}" y="${source.y + 20}" as="sourcePoint"/>
            <mxPoint x="${target.x}" y="${target.y - 20}" as="targetPoint"/>
          </mxGeometry>
        </mxCell>\n`;
            }
        }
        
        return xml;
    }

    // ==================== Sequence Diagram ====================
    generateSequenceDiagram() {
        let xml = '';
        const participantWidth = 100;
        const participantSpacing = 150;
        const messageSpacing = 50;
        let y = 40;

        this.data.participants.forEach((p, index) => {
            const x = 50 + index * participantSpacing;
            const id = this.cellId++;
            this.nodePositions.set(p.name, { id, x: x + participantWidth/2, topY: y });

            const style = p.type === 'actor' 
                ? 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;'
                : 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
            
            const width = p.type === 'actor' ? 30 : participantWidth;
            const height = p.type === 'actor' ? 60 : 40;
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(p.label)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${x + (participantWidth - width)/2}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>\n`;

            const lifelineId = this.cellId++;
            const lifelineHeight = 50 + this.data.messages.length * messageSpacing;
            xml += `        <mxCell id="${lifelineId}" value="" style="line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=#666666;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="${x + participantWidth/2}" y="${y + height}" width="1" height="${lifelineHeight}" as="geometry"/>
        </mxCell>\n`;
        });

        let msgY = 120;
        for (const msg of this.data.messages) {
            const fromPos = this.nodePositions.get(msg.from);
            const toPos = this.nodePositions.get(msg.to);
            if (!fromPos || !toPos) continue;

            const id = this.cellId++;
            const style = msg.isDashed 
                ? 'endArrow=open;html=1;rounded=0;dashed=1;'
                : 'endArrow=block;html=1;rounded=0;endFill=1;';

            xml += `        <mxCell id="${id}" value="${this.escapeXml(msg.text)}" style="${style}" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${fromPos.x}" y="${msgY}" as="sourcePoint"/>
            <mxPoint x="${toPos.x}" y="${msgY}" as="targetPoint"/>
          </mxGeometry>
        </mxCell>\n`;

            msgY += messageSpacing;
        }

        return xml;
    }

    // ==================== State Diagram ====================
    generateStateDiagram() {
        let xml = '';
        let x = 100, y = 50;
        const spacing = 180;
        let count = 0;

        for (const state of this.data.states) {
            const id = this.cellId++;
            this.nodePositions.set(state.name, { id, x, y });

            let style, width, height;
            if (state.type === 'start') {
                style = 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;strokeColor=#000000;';
                width = height = 30;
            } else if (state.type === 'end') {
                style = 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;strokeColor=#000000;strokeWidth=3;';
                width = height = 30;
                const outerId = this.cellId++;
                xml += `        <mxCell id="${outerId}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=none;strokeColor=#000000;strokeWidth=2;" vertex="1" parent="1">
          <mxGeometry x="${x - 5}" y="${y - 5}" width="40" height="40" as="geometry"/>
        </mxCell>\n`;
            } else {
                style = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
                width = 120; height = 50;
            }

            xml += `        <mxCell id="${id}" value="${this.escapeXml(state.label)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>\n`;

            count++;
            if (count % 4 === 0) { x = 100; y += 100; } else { x += spacing; }
        }

        for (const trans of this.data.transitions) {
            let fromKey = trans.from === '[*]' ? '[*]_start' : trans.from;
            let toKey = trans.to === '[*]' ? '[*]_end' : trans.to;
            
            let source = this.nodePositions.get(fromKey) || this.nodePositions.get(trans.from);
            let target = this.nodePositions.get(toKey) || this.nodePositions.get(trans.to);
            
            if (!source || !target) continue;

            const id = this.cellId++;
            xml += `        <mxCell id="${id}" value="${this.escapeXml(trans.label)}" style="endArrow=classic;html=1;rounded=0;" edge="1" parent="1" source="${source.id}" target="${target.id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
        }

        return xml;
    }

    // ==================== Mind Map ====================
    generateMindMap() {
        let xml = '';
        const centerX = 400, centerY = 300;
        const levelSpacing = 180;
        const nodeHeight = 40;
        let rightY = centerY - 100, leftY = centerY - 100;

        for (const node of this.data.mindmap) {
            const id = this.cellId++;
            let x, y, width = Math.max(100, node.text.length * 8 + 20);
            
            if (node.level === 1) {
                x = centerX - width/2;
                y = centerY - nodeHeight/2;
            } else {
                const offset = (node.level - 1) * levelSpacing;
                if (node.side === 'right') {
                    x = centerX + offset;
                    y = rightY;
                    rightY += 60;
                } else {
                    x = centerX - offset - width;
                    y = leftY;
                    leftY += 60;
                }
            }

            this.nodePositions.set(node.id, { id, x: x + width/2, y: y + nodeHeight/2 });

            const fillColor = node.level === 1 ? '#e1d5e7' : node.level === 2 ? '#dae8fc' : '#d5e8d4';
            const strokeColor = node.level === 1 ? '#9673a6' : node.level === 2 ? '#6c8ebf' : '#82b366';

            xml += `        <mxCell id="${id}" value="${this.escapeXml(node.text)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=${strokeColor};" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${nodeHeight}" as="geometry"/>
        </mxCell>\n`;

            if (node.parent !== null) {
                const parentPos = this.nodePositions.get(node.parent);
                if (parentPos) {
                    const edgeId = this.cellId++;
                    xml += `        <mxCell id="${edgeId}" value="" style="endArrow=none;html=1;rounded=1;curved=1;strokeColor=#666666;" edge="1" parent="1" source="${parentPos.id}" target="${id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
                }
            }
        }

        return xml;
    }

    // ==================== ER Diagram ====================
    generateERDiagram() {
        let xml = '';
        let x = 50, y = 50;
        const spacing = 250;
        let count = 0;

        for (const entity of this.data.entities) {
            const id = this.cellId++;
            const height = 30 + entity.attributes.length * 20;
            const width = 180;

            this.nodePositions.set(entity.name, { id, x: x + width/2, y: y + height/2 });

            xml += `        <mxCell id="${id}" value="${this.escapeXml(entity.label)}" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>\n`;

            let attrY = 26;
            for (const attr of entity.attributes) {
                const attrId = this.cellId++;
                const prefix = attr.isPrimaryKey ? 'PK ' : '';
                const value = `${prefix}${attr.name}${attr.type ? ': ' + attr.type : ''}`;
                const style = attr.isPrimaryKey 
                    ? 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontStyle=4;'
                    : 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;';
                
                xml += `        <mxCell id="${attrId}" value="${this.escapeXml(value)}" style="${style}" vertex="1" parent="${id}">
          <mxGeometry y="${attrY}" width="${width}" height="20" as="geometry"/>
        </mxCell>\n`;
                attrY += 20;
            }

            count++;
            if (count % 3 === 0) { x = 50; y += height + 80; } else { x += spacing; }
        }

        for (const rel of this.data.relationships) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            if (!source || !target) continue;

            const id = this.cellId++;
            xml += `        <mxCell id="${id}" value="${this.escapeXml(rel.label)}" style="endArrow=ERone;startArrow=ERmany;html=1;rounded=0;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${source.x + 90}" y="${source.y}" as="sourcePoint"/>
            <mxPoint x="${target.x - 90}" y="${target.y}" as="targetPoint"/>
          </mxGeometry>
        </mxCell>\n`;
        }

        return xml;
    }

    // ==================== Deployment Diagram ====================
    generateDeploymentDiagram() {
        let xml = '';
        let x = 50, y = 50;
        const spacing = 200;
        let count = 0;

        for (const node of this.data.deployments) {
            const id = this.cellId++;
            let style, width = 120, height = 80;

            switch (node.type) {
                case 'database':
                    style = 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#dae8fc;strokeColor=#6c8ebf;';
                    break;
                case 'cloud':
                    style = 'ellipse;shape=cloud;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
                    width = 140;
                    break;
                case 'artifact':
                    style = 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#fff2cc;strokeColor=#d6b656;';
                    break;
                default:
                    style = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
            }

            this.nodePositions.set(node.name, { id, x: x + width/2, y: y + height/2 });

            xml += `        <mxCell id="${id}" value="${this.escapeXml(node.label)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>\n`;

            count++;
            if (count % 4 === 0) { x = 50; y += 120; } else { x += spacing; }
        }

        for (const conn of this.data.connections) {
            const source = this.nodePositions.get(conn.from);
            const target = this.nodePositions.get(conn.to);
            if (!source || !target) continue;

            const id = this.cellId++;
            const style = conn.isDashed ? 'endArrow=classic;html=1;rounded=0;dashed=1;' : 'endArrow=classic;html=1;rounded=0;';

            xml += `        <mxCell id="${id}" value="${this.escapeXml(conn.label)}" style="${style}" edge="1" parent="1" source="${source.id}" target="${target.id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
        }

        return xml;
    }

    // ==================== Class Diagram Nodes ====================
    generateNodes() {
        let xml = '';
        let x = 40, y = 40;
        const spacing = 200;
        let count = 0;
        
        for (const cls of this.data.classes) {
            const id = this.cellId++;
            this.nodePositions.set(cls.name, { id, x, y });
            
            const height = 60 + (cls.attributes.length + cls.methods.length) * 20;
            const width = 160;
            
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
            
            for (const attr of cls.attributes) {
                const attrId = this.cellId++;
                const value = `${attr.visibility} ${attr.name}${attr.type ? ': ' + attr.type : ''}`;
                xml += `        <mxCell id="${attrId}" value="${this.escapeXml(value)}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="${id}">
          <mxGeometry y="${memberY}" width="${width}" height="20" as="geometry"/>
        </mxCell>\n`;
                memberY += 20;
            }
            
            if (cls.attributes.length > 0 && cls.methods.length > 0) {
                const sepId = this.cellId++;
                xml += `        <mxCell id="${sepId}" value="" style="line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;" vertex="1" parent="${id}">
          <mxGeometry y="${memberY}" width="${width}" height="8" as="geometry"/>
        </mxCell>\n`;
                memberY += 8;
            }
            
            for (const method of cls.methods) {
                const methodId = this.cellId++;
                const value = `${method.visibility} ${method.name}${method.type ? ': ' + method.type : ''}`;
                xml += `        <mxCell id="${methodId}" value="${this.escapeXml(value)}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="${id}">
          <mxGeometry y="${memberY}" width="${width}" height="20" as="geometry"/>
        </mxCell>\n`;
                memberY += 20;
            }
            
            count++;
            if (count % 4 === 0) { x = 40; y += height + 60; } else { x += spacing; }
        }
        
        for (const actor of this.data.actors) {
            const id = this.cellId++;
            this.nodePositions.set(actor.name, { id, x, y });
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(actor.label)}" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="30" height="60" as="geometry"/>
        </mxCell>\n`;
            
            count++;
            if (count % 4 === 0) { x = 40; y += 120; } else { x += spacing; }
        }
        
        for (const uc of this.data.usecases) {
            const id = this.cellId++;
            this.nodePositions.set(uc.name, { id, x, y });
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(uc.label)}" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/>
        </mxCell>\n`;
            
            count++;
            if (count % 4 === 0) { x = 40; y += 100; } else { x += spacing; }
        }
        
        for (const comp of this.data.components) {
            const id = this.cellId++;
            this.nodePositions.set(comp.name, { id, x, y });
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(comp.label)}" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/>
        </mxCell>\n`;
            
            count++;
            if (count % 4 === 0) { x = 40; y += 100; } else { x += spacing; }
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
            const styles = {
                'extends': 'endArrow=block;endSize=16;endFill=0;html=1;rounded=0;',
                'implements': 'endArrow=block;endSize=16;endFill=0;html=1;rounded=0;dashed=1;',
                'composition': 'endArrow=diamondThin;endFill=1;endSize=24;html=1;rounded=0;',
                'aggregation': 'endArrow=diamondThin;endFill=0;endSize=24;html=1;rounded=0;',
                'association': 'endArrow=open;endSize=12;html=1;rounded=0;',
                'dependency': 'endArrow=open;endSize=12;html=1;rounded=0;dashed=1;'
            };
            
            xml += `        <mxCell id="${id}" value="${this.escapeXml(rel.label || '')}" style="${styles[rel.type] || styles['association']}" edge="1" parent="1" source="${source.id}" target="${target.id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
        }
        
        return xml;
    }

    escapeXml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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

// ==================== Preview Renderer ====================
class PreviewRenderer {
    constructor(parsedData) {
        this.data = parsedData;
        this.nodePositions = new Map();
    }

    render() {
        switch (this.data.type) {
            case 'activity': return this.renderActivityDiagram();
            case 'sequence': return this.renderSequenceDiagram();
            case 'state': return this.renderStateDiagram();
            case 'mindmap': return this.renderMindMap();
            case 'er': return this.renderERDiagram();
            case 'deployment': return this.renderDeploymentDiagram();
            default: return this.renderClassDiagram();
        }
    }

    renderActivityDiagram() {
        let svg = '';
        const hasSwimlanes = this.data.swimlanes && this.data.swimlanes.length > 0;
        const swimlaneWidth = 200;
        let y = 30;
        let maxX = 400;
        
        // Draw swimlanes
        if (hasSwimlanes) {
            let swimlaneX = 10;
            const swimlaneHeight = 80 + this.data.activities.length * 60;
            
            for (const swimlane of this.data.swimlanes) {
                const color = swimlane.color || '#f5f5f5';
                svg += `<rect x="${swimlaneX}" y="10" width="${swimlaneWidth}" height="${swimlaneHeight}" fill="${color}" stroke="#999" stroke-width="1"/>`;
                svg += `<text x="${swimlaneX + 10}" y="30" font-size="12" font-weight="bold" fill="#333">${this.escapeXml(swimlane.label)}</text>`;
                swimlane.x = swimlaneX;
                swimlaneX += swimlaneWidth;
                maxX = Math.max(maxX, swimlaneX);
            }
            y = 50;
        }
        
        // Draw activities
        for (const activity of this.data.activities) {
            if (activity.type === 'else_marker') continue;
            
            let x = 180;
            if (hasSwimlanes && activity.swimlane !== null && this.data.swimlanes[activity.swimlane]) {
                x = this.data.swimlanes[activity.swimlane].x + swimlaneWidth / 2;
            }
            
            this.nodePositions.set(activity.id, { x, y });
            
            switch (activity.type) {
                case 'start':
                    svg += `<circle cx="${x}" cy="${y}" r="12" fill="#333"/>`;
                    y += 40;
                    break;
                case 'end':
                    svg += `<circle cx="${x}" cy="${y}" r="10" fill="#333"/>`;
                    svg += `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#333" stroke-width="2"/>`;
                    y += 40;
                    break;
                case 'action':
                    const width = Math.max(100, activity.label.length * 7 + 16);
                    svg += `<rect x="${x - width/2}" y="${y - 15}" width="${width}" height="30" rx="8" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
                    svg += `<text x="${x}" y="${y + 4}" class="label" text-anchor="middle" font-size="11">${this.escapeXml(activity.label)}</text>`;
                    y += 55;
                    break;
                case 'decision':
                    svg += `<polygon points="${x},${y - 20} ${x + 35},${y} ${x},${y + 20} ${x - 35},${y}" fill="#fff2cc" stroke="#d6b656" stroke-width="2"/>`;
                    svg += `<text x="${x}" y="${y + 4}" class="label" text-anchor="middle" font-size="9">${this.escapeXml(activity.label.substring(0, 12))}</text>`;
                    y += 55;
                    break;
                case 'merge':
                    svg += `<polygon points="${x},${y - 8} ${x + 12},${y} ${x},${y + 8} ${x - 12},${y}" fill="#f5f5f5" stroke="#666" stroke-width="2"/>`;
                    y += 30;
                    break;
                case 'fork':
                    svg += `<rect x="${x - 40}" y="${y - 2}" width="80" height="4" fill="#333"/>`;
                    y += 25;
                    break;
            }
        }
        
        // Draw edges
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            if (source && target) {
                svg += `<line x1="${source.x}" y1="${source.y + 15}" x2="${target.x}" y2="${target.y - 15}" stroke="#666" stroke-width="1.5" marker-end="url(#arrow)"/>`;
                if (rel.label) {
                    const midX = (source.x + target.x) / 2;
                    const midY = (source.y + target.y) / 2;
                    svg += `<text x="${midX + 5}" y="${midY}" font-size="10" fill="#666">${this.escapeXml(rel.label)}</text>`;
                }
            }
        }

        return this.wrapSvg(svg, maxX + 50, y + 30);
    }

    renderSequenceDiagram() {
        let svg = '';
        const participantSpacing = 150;
        const participantWidth = 100;
        const messageSpacing = 40;

        this.data.participants.forEach((p, i) => {
            const x = 50 + i * participantSpacing;
            this.nodePositions.set(p.name, { x: x + participantWidth/2 });
            svg += `<rect x="${x}" y="10" width="${participantWidth}" height="35" rx="3" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<text x="${x + participantWidth/2}" y="32" class="label" text-anchor="middle">${this.escapeXml(p.label)}</text>`;
            const lifelineHeight = 60 + this.data.messages.length * messageSpacing;
            svg += `<line x1="${x + participantWidth/2}" y1="45" x2="${x + participantWidth/2}" y2="${45 + lifelineHeight}" stroke="#999" stroke-width="1" stroke-dasharray="5,5"/>`;
        });

        let msgY = 70;
        for (const msg of this.data.messages) {
            const fromPos = this.nodePositions.get(msg.from);
            const toPos = this.nodePositions.get(msg.to);
            if (fromPos && toPos) {
                const dashStyle = msg.isDashed ? 'stroke-dasharray="5,5"' : '';
                svg += `<line x1="${fromPos.x}" y1="${msgY}" x2="${toPos.x}" y2="${msgY}" stroke="#666" stroke-width="1.5" ${dashStyle} marker-end="url(#arrow)"/>`;
                svg += `<text x="${(fromPos.x + toPos.x) / 2}" y="${msgY - 5}" class="label" text-anchor="middle" font-size="11">${this.escapeXml(msg.text)}</text>`;
                msgY += messageSpacing;
            }
        }

        return this.wrapSvg(svg, 100 + this.data.participants.length * participantSpacing, msgY + 30);
    }

    renderStateDiagram() {
        let svg = '';
        let x = 50, y = 50;
        const spacing = 150;
        let count = 0;

        for (const state of this.data.states) {
            this.nodePositions.set(state.name, { x: x + 50, y: y + 25 });
            if (state.type === 'start') {
                svg += `<circle cx="${x + 15}" cy="${y + 15}" r="12" fill="#333"/>`;
            } else if (state.type === 'end') {
                svg += `<circle cx="${x + 15}" cy="${y + 15}" r="10" fill="#333"/>`;
                svg += `<circle cx="${x + 15}" cy="${y + 15}" r="15" fill="none" stroke="#333" stroke-width="2"/>`;
            } else {
                svg += `<rect x="${x}" y="${y}" width="100" height="50" rx="10" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
                svg += `<text x="${x + 50}" y="${y + 30}" class="label" text-anchor="middle">${this.escapeXml(state.label)}</text>`;
            }
            count++;
            if (count % 4 === 0) { x = 50; y += 100; } else { x += spacing; }
        }

        for (const trans of this.data.transitions) {
            let fromKey = trans.from === '[*]' ? '[*]_start' : trans.from;
            let toKey = trans.to === '[*]' ? '[*]_end' : trans.to;
            const source = this.nodePositions.get(fromKey) || this.nodePositions.get(trans.from);
            const target = this.nodePositions.get(toKey) || this.nodePositions.get(trans.to);
            if (source && target) {
                svg += `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#666" stroke-width="1.5" marker-end="url(#arrow)"/>`;
            }
        }

        return this.wrapSvg(svg, x + 150, y + 100);
    }

    renderMindMap() {
        let svg = '';
        const centerX = 250, centerY = 150;
        const levelSpacing = 130;
        let rightY = centerY - 60, leftY = centerY - 60;

        for (const node of this.data.mindmap) {
            let x, y, width = Math.max(70, node.text.length * 7 + 14);
            if (node.level === 1) {
                x = centerX - width/2; y = centerY - 12;
            } else {
                const offset = (node.level - 1) * levelSpacing;
                if (node.side === 'right') { x = centerX + offset - width/2 + 40; y = rightY; rightY += 40; }
                else { x = centerX - offset - width/2 - 40; y = leftY; leftY += 40; }
            }
            this.nodePositions.set(node.id, { x: x + width/2, y: y + 12 });
            const fill = node.level === 1 ? '#e1d5e7' : node.level === 2 ? '#dae8fc' : '#d5e8d4';
            svg += `<rect x="${x}" y="${y}" width="${width}" height="24" rx="12" fill="${fill}" stroke="#666" stroke-width="1"/>`;
            svg += `<text x="${x + width/2}" y="${y + 16}" class="label" text-anchor="middle" font-size="10">${this.escapeXml(node.text)}</text>`;
            if (node.parent !== null) {
                const parentPos = this.nodePositions.get(node.parent);
                if (parentPos) svg += `<line x1="${parentPos.x}" y1="${parentPos.y}" x2="${x + width/2}" y2="${y + 12}" stroke="#999" fill="none" stroke-width="1"/>`;
            }
        }
        return this.wrapSvg(svg, 500, Math.max(rightY, leftY) + 40);
    }

    renderERDiagram() {
        let svg = '';
        let x = 20, y = 20;
        const spacing = 200;
        let count = 0;

        for (const entity of this.data.entities) {
            const height = 22 + entity.attributes.length * 16;
            this.nodePositions.set(entity.name, { x: x + 75, y: y + height/2 });
            svg += `<rect x="${x}" y="${y}" width="150" height="${height}" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<rect x="${x}" y="${y}" width="150" height="20" fill="#6c8ebf"/>`;
            svg += `<text x="${x + 75}" y="${y + 14}" class="label" text-anchor="middle" fill="white" font-weight="bold" font-size="11">${this.escapeXml(entity.label)}</text>`;
            let attrY = y + 34;
            for (const attr of entity.attributes) {
                svg += `<text x="${x + 8}" y="${attrY}" class="label" font-size="10">${attr.isPrimaryKey ? 'PK ' : ''}${this.escapeXml(attr.name)}</text>`;
                attrY += 16;
            }
            count++;
            if (count % 3 === 0) { x = 20; y += height + 40; } else { x += spacing; }
        }
        return this.wrapSvg(svg, x + 180, y + 120);
    }

    renderDeploymentDiagram() {
        let svg = '';
        let x = 30, y = 30;
        const spacing = 160;
        let count = 0;

        for (const node of this.data.deployments) {
            this.nodePositions.set(node.name, { x: x + 50, y: y + 35 });
            if (node.type === 'database') {
                svg += `<ellipse cx="${x + 50}" cy="${y + 12}" rx="40" ry="10" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
                svg += `<rect x="${x + 10}" y="${y + 12}" width="80" height="45" fill="#dae8fc" stroke="#dae8fc"/>`;
                svg += `<line x1="${x + 10}" y1="${y + 12}" x2="${x + 10}" y2="${y + 57}" stroke="#6c8ebf" stroke-width="2"/>`;
                svg += `<line x1="${x + 90}" y1="${y + 12}" x2="${x + 90}" y2="${y + 57}" stroke="#6c8ebf" stroke-width="2"/>`;
                svg += `<ellipse cx="${x + 50}" cy="${y + 57}" rx="40" ry="10" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            } else {
                svg += `<rect x="${x}" y="${y}" width="100" height="70" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            }
            svg += `<text x="${x + 50}" y="${y + 40}" class="label" text-anchor="middle" font-size="11">${this.escapeXml(node.label)}</text>`;
            count++;
            if (count % 4 === 0) { x = 30; y += 100; } else { x += spacing; }
        }

        for (const conn of this.data.connections) {
            const source = this.nodePositions.get(conn.from);
            const target = this.nodePositions.get(conn.to);
            if (source && target) {
                svg += `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#666" stroke-width="1.5" marker-end="url(#arrow)"/>`;
            }
        }
        return this.wrapSvg(svg, x + 130, y + 90);
    }

    renderClassDiagram() {
        let svg = '';
        let x = 40, y = 40;
        const spacing = 180;
        let count = 0;
        
        for (const cls of this.data.classes) {
            const height = 50 + (cls.attributes.length + cls.methods.length) * 16;
            const width = 140;
            this.nodePositions.set(cls.name, { x: x + width/2, y: y + height/2 });
            const fillColor = cls.type === 'interface' ? '#d5e8d4' : '#dae8fc';
            svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" fill="${fillColor}" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<rect x="${x}" y="${y}" width="${width}" height="22" fill="${fillColor}" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<text x="${x + width/2}" y="${y + 15}" class="label" text-anchor="middle" font-weight="bold" font-size="11">${this.escapeXml(cls.name)}</text>`;
            let memberY = y + 36;
            for (const attr of cls.attributes) {
                svg += `<text x="${x + 6}" y="${memberY}" class="label" font-size="10">${attr.visibility} ${this.escapeXml(attr.name)}</text>`;
                memberY += 16;
            }
            for (const method of cls.methods) {
                svg += `<text x="${x + 6}" y="${memberY}" class="label" font-size="10">${method.visibility} ${this.escapeXml(method.name)}</text>`;
                memberY += 16;
            }
            count++;
            if (count % 3 === 0) { x = 40; y += height + 50; } else { x += spacing; }
        }
        
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            if (source && target) {
                const isDashed = rel.type === 'implements' || rel.type === 'dependency';
                svg += `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#666" stroke-width="1.5" ${isDashed ? 'stroke-dasharray="5,5"' : ''} marker-end="url(#arrow)"/>`;
            }
        }
        return this.wrapSvg(svg, x + 180, y + 120);
    }

    wrapSvg(content, width, height) {
        return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#666"/></marker></defs>
            ${content}
        </svg>`;
    }

    escapeXml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

// ==================== Main Functions ====================
function convert() {
    const input = document.getElementById('plantuml-input').value.trim();
    const outputEl = document.getElementById('drawio-output');
    const previewEl = document.getElementById('preview');
    
    if (!input) { showStatus('Please enter PlantUML code', 'error'); return; }
    
    try {
        const parser = new PlantUMLParser(input);
        const parsed = parser.parse();
        
        const hasElements = parsed.classes?.length > 0 || parsed.actors?.length > 0 || 
            parsed.usecases?.length > 0 || parsed.components?.length > 0 ||
            parsed.nodes?.length > 0 || parsed.activities?.length > 0 ||
            parsed.participants?.length > 0 || parsed.states?.length > 0 ||
            parsed.mindmap?.length > 0 || parsed.entities?.length > 0 ||
            parsed.deployments?.length > 0;
            
        if (!hasElements) { showStatus('No valid elements found in PlantUML code', 'error'); return; }
        
        const generator = new DrawioGenerator(parsed);
        outputEl.value = generator.generate();
        
        const renderer = new PreviewRenderer(parsed);
        previewEl.innerHTML = renderer.render();
        
        const swimlaneInfo = parsed.swimlanes?.length > 0 ? ` with ${parsed.swimlanes.length} swimlanes` : '';
        const partitionInfo = parsed.partitions?.length > 0 ? ` and ${parsed.partitions.length} partitions` : '';
        showStatus(`Successfully converted ${parsed.type} diagram${swimlaneInfo}${partitionInfo}!`, 'success');
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        console.error(error);
    }
}

function downloadDrawio() {
    const output = document.getElementById('drawio-output').value;
    if (!output) { showStatus('Please convert PlantUML first', 'error'); return; }
    
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

function loadExample(type) {
    const examples = {
        'class': `@startuml
class User {
  +id: int
  +name: string
  -password: string
  +login()
  +logout()
}

class Order {
  +id: int
  +total: decimal
  +process()
}

User --> Order : creates
@enduml`,
        'sequence': `@startuml
participant User
participant Server
participant Database

User -> Server : Request
Server -> Database : Query
Database --> Server : Result
Server --> User : Response
@enduml`,
        'activity': `@startuml
|C端用户|
start
:选择商品;
:确认下单;

|#AntiqueWhite|B端后台|
if (支付方式?) then (全款)
  :支付全款;
  :待审核;
else (定金)
  :支付定金;
  :待支付尾款;
  :支付尾款;
  :待审核;
endif

partition 审核环节 {
  if (审核结果?) then (通过)
    :待分配;
  else (驳回)
    :待修改;
  endif
}

:订单完成;
stop
@enduml`,
        'state': `@startuml
[*] --> Pending
Pending --> Processing : start
Processing --> Completed : finish
Processing --> Failed : error
Completed --> [*]
Failed --> [*]
@enduml`,
        'mindmap': `@startmindmap
+ 项目规划
++ 需求分析
+++ 用户调研
+++ 竞品分析
++ 设计阶段
-- 开发阶段
--- 前端开发
--- 后端开发
-- 测试上线
@endmindmap`,
        'er': `@startuml
entity User {
  *id : int
  name : string
  email : string
}

entity Order {
  *id : int
  total : decimal
}

User ||--o{ Order : places
@enduml`,
        'deployment': `@startuml
node "Web Server" as web
database "Database" as db
cloud "CDN" as cdn

cdn --> web
web --> db
@enduml`
    };
    
    document.getElementById('plantuml-input').value = examples[type] || examples['class'];
    convert();
}

function showStatus(message, type) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
}
