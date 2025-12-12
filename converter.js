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
            case 'activity': return this.parseActivityDiagram(lines);
            case 'sequence': return this.parseSequenceDiagram(lines);
            case 'state': return this.parseStateDiagram(lines);
            case 'mindmap': return this.parseMindMap(lines);
            case 'er': return this.parseERDiagram(lines);
            case 'deployment': return this.parseDeploymentDiagram(lines);
            case 'usecase': return this.parseUseCaseDiagram(lines);
            default: return this.parseClassDiagram(lines);
        }
    }

    detectDiagramType(lines) {
        const input = this.input.toLowerCase();
        const rawInput = this.input;
        
        // Check for sequence diagram FIRST - has participant or actor with -> messages
        // Key: sequence diagrams have "A -> B : message" pattern
        if (lines.some(l => /^[\w"]+\s*-+>+\s*[\w"]+\s*:/.test(l)) ||
            (input.includes('participant ') && input.includes(' -> ')) ||
            (input.includes('actor ') && input.includes(' -> ') && lines.some(l => /^\w+\s*-+>\s*\w+\s*:/.test(l)))) {
            return 'sequence';
        }
        
        // Check for usecase diagram - actor with usecase or rectangle (but NOT sequence messages)
        if ((input.includes('actor ') && (input.includes('usecase ') || input.includes('rectangle '))) &&
            !lines.some(l => /^\w+\s*-+>\s*\w+\s*:/.test(l))) {
            return 'usecase';
        }
        
        // Check for activity diagram  
        if ((input.includes('start') && (input.includes('stop') || rawInput.includes(':') && rawInput.includes(';'))) ||
            lines.some(l => /^:.*;\s*$/.test(l)) || 
            (input.includes('if (') && input.includes('endif'))) {
            return 'activity';
        }
        
        // Check for state diagram
        if (input.includes('[*]') || (input.includes('state ') && lines.some(l => /--?>/.test(l)))) {
            return 'state';
        }
        
        if (input.includes('@startmindmap')) return 'mindmap';
        if (input.includes('entity ') || input.includes('}|') || input.includes('|{')) return 'er';
        if (input.includes('database ') || input.includes('cloud ') || input.includes('artifact ')) return 'deployment';
        
        return 'class';
    }

    // ==================== Activity Diagram ====================
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
        let swimlaneMap = new Map();
        let partitionStack = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('@') || line.startsWith('!') || line.startsWith('skinparam') || 
                line.startsWith('title') || line === '') continue;
            
            // Multi-line notes
            if (line.startsWith('note ')) {
                inNote = true;
                noteBuffer = [line.replace(/note\s+(left|right|top|bottom)/, '').trim()];
                continue;
            }
            if (line === 'end note') {
                inNote = false;
                if (activities.length > 0) {
                    activities[activities.length - 1].note = noteBuffer.join('\n').replace(/^\s+/gm, '');
                }
                noteBuffer = [];
                continue;
            }
            if (inNote) { noteBuffer.push(line); continue; }

            // Swimlane
            const swimlaneMatch = line.match(/^\|(?:#(\w+)\|)?([^|]+)\|$/);
            if (swimlaneMatch) {
                const color = swimlaneMatch[1] || null;
                const label = swimlaneMatch[2].trim();
                if (!swimlaneMap.has(label)) {
                    const swimlane = { id: swimlanes.length, label, color, startIndex: activities.length };
                    swimlanes.push(swimlane);
                    swimlaneMap.set(label, swimlane);
                }
                currentSwimlane = swimlaneMap.get(label);
                continue;
            }

            // Partition
            const partitionMatch = line.match(/^partition\s+"?([^"{]+)"?\s*\{?$/);
            if (partitionMatch) {
                const partition = { id: partitions.length, label: partitionMatch[1].trim(), startIndex: activities.length, endIndex: -1 };
                partitions.push(partition);
                partitionStack.push(partition);
                continue;
            }
            if (line === '}' && partitionStack.length > 0) {
                partitionStack.pop().endIndex = activities.length;
                continue;
            }
            
            const currentPartition = partitionStack.length > 0 ? partitionStack[partitionStack.length - 1] : null;
            const baseProps = {
                swimlane: currentSwimlane ? currentSwimlane.id : null,
                partition: currentPartition ? currentPartition.id : null
            };

            if (line === 'start') {
                activities.push({ id: nodeId++, type: 'start', label: 'Start', ...baseProps });
                continue;
            }
            if (line === 'stop' || line === 'end') {
                activities.push({ id: nodeId++, type: 'end', label: 'End', ...baseProps });
                continue;
            }
            if (line === 'fork' || line === 'fork again' || line === 'end fork') {
                activities.push({ id: nodeId++, type: 'fork', label: '', ...baseProps });
                continue;
            }
            
            // Activity :text;
            const activityMatch = line.match(/^:(.+);$/);
            if (activityMatch) {
                activities.push({ id: nodeId++, type: 'action', label: activityMatch[1].trim(), ...baseProps });
                continue;
            }
            
            // If condition
            const ifMatch = line.match(/^if\s*\((.+)\)\s*then\s*\((.+)\)$/);
            if (ifMatch) {
                const id = nodeId++;
                activities.push({ id, type: 'decision', label: ifMatch[1].trim(), yesBranch: ifMatch[2].trim(), ...baseProps });
                stack.push({ type: 'if', id, branches: [{ label: ifMatch[2].trim(), startIndex: activities.length }] });
                continue;
            }
            
            // Elseif
            const elseifMatch = line.match(/^elseif\s*\((.+)\)\s*then\s*\((.+)\)$/);
            if (elseifMatch && stack.length > 0) {
                const current = stack[stack.length - 1];
                activities.push({ id: nodeId++, type: 'elseif_marker', label: elseifMatch[2].trim(), condition: elseifMatch[1].trim(), relatedDecision: current.id, ...baseProps });
                current.branches.push({ label: elseifMatch[2].trim(), startIndex: activities.length });
                continue;
            }
            
            // Else
            const elseMatch = line.match(/^else\s*\((.+)\)$/);
            if (elseMatch && stack.length > 0) {
                const current = stack[stack.length - 1];
                activities.push({ id: nodeId++, type: 'else_marker', label: elseMatch[1].trim(), relatedDecision: current.id, ...baseProps });
                current.branches.push({ label: elseMatch[1].trim(), startIndex: activities.length });
                continue;
            }
            
            if (line === 'endif' && stack.length > 0) {
                const finished = stack.pop();
                activities.push({ id: nodeId++, type: 'merge', label: '', relatedDecision: finished.id, ...baseProps });
                continue;
            }

            // While
            const whileMatch = line.match(/^while\s*\((.+)\)\s*(?:is\s*\((.+)\))?$/);
            if (whileMatch) {
                activities.push({ id: nodeId++, type: 'decision', label: whileMatch[1], yesBranch: whileMatch[2] || 'yes', ...baseProps });
                continue;
            }
            if (line.startsWith('endwhile')) {
                activities.push({ id: nodeId++, type: 'merge', label: '', ...baseProps });
                continue;
            }
        }
        
        this.buildActivityEdges(activities, edges);
        return { type: 'activity', activities, relations: edges, swimlanes, partitions, classes: [], actors: [], usecases: [], components: [], nodes: [], notes: [] };
    }

    buildActivityEdges(activities, edges) {
        const decisionMergeMap = new Map();
        for (const act of activities) {
            if (act.type === 'merge' && act.relatedDecision !== undefined) {
                decisionMergeMap.set(act.relatedDecision, act.id);
            }
        }

        for (let i = 0; i < activities.length - 1; i++) {
            const current = activities[i];
            const next = activities[i + 1];
            
            if (current.type === 'else_marker' || current.type === 'elseif_marker') continue;
            
            if (current.type === 'merge') {
                if (next && next.type !== 'end') edges.push({ from: current.id, to: next.id, label: '' });
                continue;
            }

            if (current.type === 'decision') {
                edges.push({ from: current.id, to: next.id, label: current.yesBranch || '' });
                for (let j = i + 1; j < activities.length; j++) {
                    const act = activities[j];
                    if ((act.type === 'else_marker' || act.type === 'elseif_marker') && act.relatedDecision === current.id) {
                        if (j + 1 < activities.length) edges.push({ from: current.id, to: activities[j + 1].id, label: act.label });
                    }
                }
                continue;
            }
            
            if (next.type !== 'else_marker' && next.type !== 'elseif_marker') {
                edges.push({ from: current.id, to: next.id, label: '' });
            } else {
                const mergeId = decisionMergeMap.get(next.relatedDecision);
                if (mergeId !== undefined) edges.push({ from: current.id, to: mergeId, label: '' });
            }
        }
    }

    // ==================== Sequence Diagram ====================
    parseSequenceDiagram(lines) {
        const participants = [];
        const messages = [];
        const groups = [];
        const participantMap = new Map();
        let msgId = 0;
        let currentGroup = null;
        let inAlt = false;
        let altStack = [];
        let noteBuffer = [];
        let inNote = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('@') || line.startsWith('!') || line.startsWith('skinparam') || 
                line.startsWith('title') || line.startsWith('hide')) continue;

            // Note handling
            if (line.startsWith('note ')) {
                inNote = true;
                noteBuffer = [line];
                continue;
            }
            if (line === 'end note') {
                inNote = false;
                if (messages.length > 0) messages[messages.length - 1].note = noteBuffer.join('\n');
                noteBuffer = [];
                continue;
            }
            if (inNote) { noteBuffer.push(line); continue; }

            // Group separator: == Title ==
            const groupMatch = line.match(/^==\s*(.+)\s*==$/);
            if (groupMatch) {
                groups.push({ label: groupMatch[1].trim(), startIndex: messages.length });
                continue;
            }

            // Alt/else/end blocks
            if (line.startsWith('alt ')) {
                altStack.push({ type: 'alt', label: line.replace('alt ', '').trim(), startIndex: messages.length });
                continue;
            }
            if (line.startsWith('else')) {
                if (altStack.length > 0) altStack[altStack.length - 1].elseIndex = messages.length;
                continue;
            }
            if (line === 'end') {
                if (altStack.length > 0) altStack.pop();
                continue;
            }

            // Participant/Actor
            const participantMatch = line.match(/^(participant|actor)\s+"([^"]+)"\s+as\s+(\w+)/i) ||
                                    line.match(/^(participant|actor)\s+(\w+)(?:\s+as\s+(\w+))?/i);
            if (participantMatch) {
                const type = participantMatch[1].toLowerCase();
                const label = participantMatch[2];
                const name = participantMatch[3] || participantMatch[2];
                if (!participantMap.has(name)) {
                    participantMap.set(name, { name, label, type });
                    participants.push({ name, label, type });
                }
                continue;
            }

            // Message: A -> B : text or A ->> B : text
            const messageMatch = line.match(/^("?[^"]+?"?)\s*([-<>\.]+)\s*("?[^"]+?"?)\s*:\s*(.*)$/);
            if (messageMatch) {
                let from = messageMatch[1].replace(/"/g, '').trim();
                const arrow = messageMatch[2];
                let to = messageMatch[3].replace(/"/g, '').trim();
                const text = messageMatch[4].trim();
                
                [from, to].forEach(p => {
                    if (!participantMap.has(p)) {
                        participantMap.set(p, { name: p, label: p, type: 'participant' });
                        participants.push({ name: p, label: p, type: 'participant' });
                    }
                });

                messages.push({
                    id: msgId++, from, to, text,
                    isReturn: arrow.includes('<') || arrow.includes('--'),
                    isAsync: arrow.includes('>>'),
                    isDashed: arrow.includes('--') || arrow.includes('..')
                });
            }
        }

        return { type: 'sequence', participants, messages, groups, notes: this.notes, classes: [], actors: [], usecases: [], components: [], nodes: [], activities: [], relations: [] };
    }

    // ==================== State Diagram ====================
    parseStateDiagram(lines) {
        const states = [];
        const transitions = [];
        const stateMap = new Map();
        let stateId = 0;
        let noteBuffer = [];
        let inNote = false;
        let noteTarget = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('@') || line.startsWith('!') || line.startsWith('skinparam') || 
                line.startsWith('title') || line.startsWith('hide') || line === '') continue;

            // Note handling
            const noteStartMatch = line.match(/^note\s+(left|right)\s+of\s+(\w+)/);
            if (noteStartMatch || line.startsWith('note ')) {
                inNote = true;
                noteTarget = noteStartMatch ? noteStartMatch[2] : null;
                noteBuffer = [];
                continue;
            }
            if (line === 'end note') {
                inNote = false;
                if (noteTarget && stateMap.has(noteTarget)) {
                    stateMap.get(noteTarget).note = noteBuffer.join('\n');
                }
                noteBuffer = [];
                noteTarget = null;
                continue;
            }
            if (inNote) { noteBuffer.push(line); continue; }

            // State with label: state "Label" as Name
            const stateMatch = line.match(/^state\s+"([^"]+)"\s+as\s+(\w+)/);
            if (stateMatch) {
                if (!stateMap.has(stateMatch[2])) {
                    const state = { id: stateId++, name: stateMatch[2], label: stateMatch[1], type: 'state' };
                    stateMap.set(stateMatch[2], state);
                    states.push(state);
                }
                continue;
            }

            // Simple state: state StateName
            const simpleStateMatch = line.match(/^state\s+(\w+)(?:\s*\{)?$/);
            if (simpleStateMatch) {
                if (!stateMap.has(simpleStateMatch[1])) {
                    const state = { id: stateId++, name: simpleStateMatch[1], label: simpleStateMatch[1], type: 'state' };
                    stateMap.set(simpleStateMatch[1], state);
                    states.push(state);
                }
                continue;
            }

            // Transition: [*] --> State or State --> State : label
            const transMatch = line.match(/^(\[\*\]|[\u4e00-\u9fa5\w]+)\s*([-]+>)\s*(\[\*\]|[\u4e00-\u9fa5\w]+)(?:\s*:\s*(.+))?$/);
            if (transMatch) {
                const from = transMatch[1];
                const to = transMatch[3];
                const label = transMatch[4] || '';

                [{ s: from, isFrom: true }, { s: to, isFrom: false }].forEach(({ s, isFrom }) => {
                    if (s === '[*]') {
                        const key = isFrom ? '[*]_start' : '[*]_end';
                        if (!stateMap.has(key)) {
                            stateMap.set(key, { id: stateId++, name: s, label: isFrom ? 'Start' : 'End', type: isFrom ? 'start' : 'end' });
                            states.push(stateMap.get(key));
                        }
                    } else if (!stateMap.has(s)) {
                        const state = { id: stateId++, name: s, label: s, type: 'state' };
                        stateMap.set(s, state);
                        states.push(state);
                    }
                });

                transitions.push({ from, to, label });
            }
        }

        return { type: 'state', states, transitions, classes: [], actors: [], usecases: [], components: [], nodes: [], activities: [], relations: [], notes: [] };
    }

    // ==================== Use Case Diagram ====================
    parseUseCaseDiagram(lines) {
        const actors = [];
        const usecases = [];
        const relations = [];
        const rectangles = [];
        const actorMap = new Map();
        const usecaseMap = new Map();
        let currentRectangle = null;
        let rectStack = [];

        for (const line of lines) {
            if (line.startsWith('@') || line.startsWith('!') || line.startsWith('skinparam') || 
                line.startsWith('title') || line.startsWith('hide') || line === '') continue;

            // Rectangle container
            const rectMatch = line.match(/^rectangle\s+"([^"]+)"\s*\{?$/);
            if (rectMatch) {
                const rect = { label: rectMatch[1], usecases: [] };
                rectangles.push(rect);
                rectStack.push(rect);
                currentRectangle = rect;
                continue;
            }
            if (line === '}' && rectStack.length > 0) {
                rectStack.pop();
                currentRectangle = rectStack.length > 0 ? rectStack[rectStack.length - 1] : null;
                continue;
            }

            // Actor: actor "Label" as name or actor name
            const actorMatch = line.match(/^actor\s+"([^"]+)"\s+as\s+(\w+)/i) ||
                              line.match(/^actor\s+(\w+)/i);
            if (actorMatch) {
                const label = actorMatch[1];
                const name = actorMatch[2] || actorMatch[1];
                if (!actorMap.has(name)) {
                    actorMap.set(name, { name, label });
                    actors.push({ name, label });
                }
                continue;
            }

            // Usecase: usecase "Label" as name or (Label) as name
            const usecaseMatch = line.match(/^usecase\s+"([^"]+)"\s+as\s+(\w+)/i) ||
                                line.match(/^usecase\s+"?([^"]+)"?/i) ||
                                line.match(/^\(([^)]+)\)\s*(?:as\s+(\w+))?/);
            if (usecaseMatch) {
                const label = usecaseMatch[1];
                const name = usecaseMatch[2] || usecaseMatch[1].replace(/\s+/g, '_');
                if (!usecaseMap.has(name)) {
                    usecaseMap.set(name, { name, label, rectangle: currentRectangle ? currentRectangle.label : null });
                    usecases.push({ name, label, rectangle: currentRectangle ? currentRectangle.label : null });
                    if (currentRectangle) currentRectangle.usecases.push(name);
                }
                continue;
            }

            // Relation: actor --> usecase or actor -- usecase
            const relMatch = line.match(/^(\w+)\s*([-\.]+>?)\s*(\w+|\([^)]+\))(?:\s*:\s*(.+))?$/);
            if (relMatch) {
                let from = relMatch[1];
                let to = relMatch[3].replace(/[()]/g, '');
                const label = relMatch[4] || '';
                const arrow = relMatch[2];

                // Auto-add actors/usecases
                if (!actorMap.has(from) && !usecaseMap.has(from)) {
                    if (from.match(/^[A-Z]/) || from.includes('用户') || from.includes('员')) {
                        actorMap.set(from, { name: from, label: from });
                        actors.push({ name: from, label: from });
                    }
                }
                if (!usecaseMap.has(to) && !actorMap.has(to)) {
                    usecaseMap.set(to, { name: to, label: to, rectangle: null });
                    usecases.push({ name: to, label: to, rectangle: null });
                }

                relations.push({ from, to, label, type: arrow.includes('>') ? 'association' : 'link' });
            }
        }

        return { type: 'usecase', actors, usecases, relations, rectangles, classes: [], components: [], nodes: [], activities: [], notes: [] };
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
                const node = { id: nodeId++, text, level, side: isRight ? 'right' : 'left', parent: level > 1 ? lastNodeByLevel[level - 1] : null };
                nodes.push(node);
                lastNodeByLevel[level] = node.id;
            }
        }

        return { type: 'mindmap', mindmap: nodes, classes: [], actors: [], usecases: [], components: [], nodes: [], activities: [], relations: [], notes: [] };
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

            const entityMatch = line.match(/^entity\s+"?([^"{\s]+)"?\s*(?:as\s+(\w+))?\s*\{?$/);
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
                relationships.push({ from: relMatch[1], to: relMatch[3], label: relMatch[4] || '', fromCard: '1', toCard: 'n' });
            }
        }

        return { type: 'er', entities, relationships, classes: [], actors: [], usecases: [], components: [], nodes: [], activities: [], relations: [], notes: [] };
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

            const nodeMatch = line.match(/^(node|database|cloud|artifact|folder|frame|package|rectangle|storage)\s+"([^"]+)"\s+as\s+(\w+)/i) ||
                             line.match(/^(node|database|cloud|artifact|folder|frame|package|rectangle|storage)\s+"?([^"{\s]+)"?\s*\{?$/i);
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
                connections.push({ from: connMatch[1], to: connMatch[3], label: connMatch[4] || '', isDashed: connMatch[2].includes('.') });
            }
        }

        return { type: 'deployment', deployments, connections, classes: [], actors: [], usecases: [], components: [], nodes: [], activities: [], relations: [], notes: [] };
    }

    // ==================== Class Diagram ====================
    parseClassDiagram(lines) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('@') || line.startsWith('skinparam') || line.startsWith('hide') || line.startsWith('show')) continue;
            
            if (line.startsWith('class ') || line.startsWith('interface ') || line.startsWith('abstract ') || line.startsWith('enum ')) {
                const classData = this.parseClass(lines, i);
                if (classData) { this.classes.push(classData.classObj); i = classData.endIndex; }
                continue;
            }
            
            if (line.startsWith('actor ')) {
                const match = line.match(/actor\s+"?([^"]+)"?\s*(?:as\s+(\w+))?/);
                if (match) this.actors.push({ name: match[2] || match[1], label: match[1] });
                continue;
            }
            
            const relation = this.parseRelation(line);
            if (relation) this.relations.push(relation);
        }
        
        return { type: this.diagramType, classes: this.classes, relations: this.relations, actors: this.actors, usecases: this.usecases, components: this.components, nodes: this.nodes, notes: this.notes, activities: this.activities };
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
        if (content.includes(':')) { const parts = content.split(':'); name = parts[0].trim(); type = parts[1].trim(); }
        else { name = content; type = ''; }
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
            if (match) return { from: match[pattern.from], to: match[pattern.to], type: pattern.type, label: pattern.label ? (match[pattern.label] || '').trim() : '' };
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

    generate(compressed = false) {
        let xml = '';
        switch (this.data.type) {
            case 'activity': xml = this.generateActivityDiagram(); break;
            case 'sequence': xml = this.generateSequenceDiagram(); break;
            case 'state': xml = this.generateStateDiagram(); break;
            case 'mindmap': xml = this.generateMindMap(); break;
            case 'er': xml = this.generateERDiagram(); break;
            case 'deployment': xml = this.generateDeploymentDiagram(); break;
            case 'usecase': xml = this.generateUseCaseDiagram(); break;
            default: xml = this.generateNodes() + this.generateEdges();
        }
        return this.wrapInDrawioFormat(xml, compressed);
    }

    // ==================== Activity Diagram ====================
    generateActivityDiagram() {
        let xml = '';
        const hasSwimlanes = this.data.swimlanes?.length > 0;
        const swimlaneWidth = 250;
        const nodeWidth = 140;
        const nodeHeight = 40;
        const spacing = 70;
        let startY = 40;
        
        if (hasSwimlanes) {
            let swimlaneX = 20;
            const swimlaneHeight = 100 + this.data.activities.length * spacing;
            for (const swimlane of this.data.swimlanes) {
                const id = this.cellId++;
                const fillColor = swimlane.color || '#f5f5f5';
                xml += `        <mxCell id="${id}" value="${this.escapeXml(swimlane.label)}" style="swimlane;horizontal=0;whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=#666666;startSize=30;" vertex="1" parent="1">
          <mxGeometry x="${swimlaneX}" y="${startY}" width="${swimlaneWidth}" height="${swimlaneHeight}" as="geometry"/>
        </mxCell>\n`;
                swimlane.cellId = id;
                swimlane.x = swimlaneX;
                swimlaneX += swimlaneWidth;
            }
            startY += 50;
        }
        
        let yPositions = new Map();
        let currentY = startY;
        for (const activity of this.data.activities) {
            if (activity.type === 'else_marker' || activity.type === 'elseif_marker') continue;
            yPositions.set(activity.id, currentY);
            if (activity.type === 'start' || activity.type === 'end') currentY += 50;
            else if (activity.type === 'decision') currentY += 80;
            else if (activity.type === 'merge' || activity.type === 'fork') currentY += 40;
            else currentY += spacing;
        }
        
        for (const activity of this.data.activities) {
            if (activity.type === 'else_marker' || activity.type === 'elseif_marker') continue;
            const id = this.cellId++;
            const y = yPositions.get(activity.id);
            let x = 150;
            if (hasSwimlanes && activity.swimlane !== null && this.data.swimlanes[activity.swimlane]) {
                x = this.data.swimlanes[activity.swimlane].x + swimlaneWidth / 2 - nodeWidth / 2 + 30;
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
                    xml += `        <mxCell id="${this.cellId++}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=none;strokeColor=#000000;strokeWidth=2;" vertex="1" parent="1">
          <mxGeometry x="${x + nodeWidth/2 - 20}" y="${y - 5}" width="40" height="40" as="geometry"/>
        </mxCell>\n`;
                    break;
                case 'action':
                    const width = Math.max(nodeWidth, activity.label.length * 8 + 20);
                    xml += `        <mxCell id="${id}" value="${this.escapeXml(activity.label)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${nodeHeight}" as="geometry"/>
        </mxCell>\n`;
                    if (activity.note) {
                        xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(activity.note)}" style="shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;fillColor=#fff2cc;strokeColor=#d6b656;size=14;align=left;spacingLeft=5;fontSize=10;" vertex="1" parent="1">
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
        
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            if (source && target) {
                xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(rel.label || '')}" style="endArrow=classic;html=1;rounded=0;" edge="1" parent="1">
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
            const style = p.type === 'actor' ? 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;' : 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
            const width = p.type === 'actor' ? 30 : participantWidth;
            const height = p.type === 'actor' ? 60 : 40;
            xml += `        <mxCell id="${id}" value="${this.escapeXml(p.label)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${x + (participantWidth - width)/2}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>\n`;
            const lifelineHeight = 50 + this.data.messages.length * messageSpacing;
            xml += `        <mxCell id="${this.cellId++}" value="" style="line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=#666666;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="${x + participantWidth/2}" y="${y + height}" width="1" height="${lifelineHeight}" as="geometry"/>
        </mxCell>\n`;
        });

        // Groups
        if (this.data.groups?.length > 0) {
            for (const group of this.data.groups) {
                const groupY = 100 + group.startIndex * messageSpacing;
                xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(group.label)}" style="shape=rectangle;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;dashed=1;verticalAlign=top;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="30" y="${groupY}" width="${this.data.participants.length * participantSpacing}" height="40" as="geometry"/>
        </mxCell>\n`;
            }
        }

        let msgY = 120;
        for (const msg of this.data.messages) {
            const fromPos = this.nodePositions.get(msg.from);
            const toPos = this.nodePositions.get(msg.to);
            if (!fromPos || !toPos) continue;
            const style = msg.isDashed ? 'endArrow=open;html=1;rounded=0;dashed=1;' : 'endArrow=block;html=1;rounded=0;endFill=1;';
            const edgeId = this.cellId++;
            xml += `        <mxCell id="${edgeId}" value="${this.escapeXml(msg.text)}" style="${style}" edge="1" parent="1">
          <mxGeometry width="50" height="50" relative="1" as="geometry">
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
                xml += `        <mxCell id="${this.cellId++}" value="" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=none;strokeColor=#000000;strokeWidth=2;" vertex="1" parent="1">
          <mxGeometry x="${x - 5}" y="${y - 5}" width="40" height="40" as="geometry"/>
        </mxCell>\n`;
            } else {
                style = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
                width = Math.max(120, state.label.length * 8 + 20);
                height = 50;
            }
            xml += `        <mxCell id="${id}" value="${this.escapeXml(state.label)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>\n`;
            if (state.note) {
                xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(state.note)}" style="shape=note;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;size=14;align=left;spacingLeft=5;fontSize=10;" vertex="1" parent="1">
          <mxGeometry x="${x + width + 10}" y="${y}" width="120" height="60" as="geometry"/>
        </mxCell>\n`;
            }
            count++;
            if (count % 4 === 0) { x = 100; y += 100; } else { x += spacing; }
        }

        for (const trans of this.data.transitions) {
            let fromKey = trans.from === '[*]' ? '[*]_start' : trans.from;
            let toKey = trans.to === '[*]' ? '[*]_end' : trans.to;
            let source = this.nodePositions.get(fromKey) || this.nodePositions.get(trans.from);
            let target = this.nodePositions.get(toKey) || this.nodePositions.get(trans.to);
            if (!source || !target) continue;
            xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(trans.label)}" style="endArrow=classic;html=1;rounded=0;" edge="1" parent="1" source="${source.id}" target="${target.id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
        }
        return xml;
    }

    // ==================== Use Case Diagram ====================
    generateUseCaseDiagram() {
        let xml = '';
        let actorX = 50, actorY = 100;
        let usecaseX = 300, usecaseY = 50;
        const actorSpacing = 100;
        const usecaseSpacing = 80;

        // Rectangles
        if (this.data.rectangles?.length > 0) {
            for (const rect of this.data.rectangles) {
                const height = Math.max(200, rect.usecases.length * usecaseSpacing + 50);
                xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(rect.label)}" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;verticalAlign=top;fontStyle=1;spacingTop=5;" vertex="1" parent="1">
          <mxGeometry x="250" y="30" width="300" height="${height}" as="geometry"/>
        </mxCell>\n`;
            }
        }

        // Actors
        for (const actor of this.data.actors) {
            const id = this.cellId++;
            this.nodePositions.set(actor.name, { id, x: actorX + 15, y: actorY + 30 });
            xml += `        <mxCell id="${id}" value="${this.escapeXml(actor.label)}" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;" vertex="1" parent="1">
          <mxGeometry x="${actorX}" y="${actorY}" width="30" height="60" as="geometry"/>
        </mxCell>\n`;
            actorY += actorSpacing;
        }

        // Usecases
        for (const uc of this.data.usecases) {
            const id = this.cellId++;
            this.nodePositions.set(uc.name, { id, x: usecaseX + 60, y: usecaseY + 25 });
            xml += `        <mxCell id="${id}" value="${this.escapeXml(uc.label)}" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${usecaseX}" y="${usecaseY}" width="120" height="50" as="geometry"/>
        </mxCell>\n`;
            usecaseY += usecaseSpacing;
        }

        // Relations
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            if (!source || !target) continue;
            xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(rel.label || '')}" style="endArrow=none;html=1;rounded=0;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${source.x}" y="${source.y}" as="sourcePoint"/>
            <mxPoint x="${target.x}" y="${target.y}" as="targetPoint"/>
          </mxGeometry>
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
            if (node.level === 1) { x = centerX - width/2; y = centerY - nodeHeight/2; }
            else {
                const offset = (node.level - 1) * levelSpacing;
                if (node.side === 'right') { x = centerX + offset; y = rightY; rightY += 60; }
                else { x = centerX - offset - width; y = leftY; leftY += 60; }
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
                    xml += `        <mxCell id="${this.cellId++}" value="" style="endArrow=none;html=1;rounded=1;curved=1;strokeColor=#666666;" edge="1" parent="1" source="${parentPos.id}" target="${id}">
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
                const style = attr.isPrimaryKey ? 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontStyle=4;' : 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;';
                xml += `        <mxCell id="${attrId}" value="${this.escapeXml(prefix + attr.name + (attr.type ? ': ' + attr.type : ''))}" style="${style}" vertex="1" parent="${id}">
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
            xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(rel.label)}" style="endArrow=ERone;startArrow=ERmany;html=1;rounded=0;" edge="1" parent="1">
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
                case 'database': style = 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#dae8fc;strokeColor=#6c8ebf;'; break;
                case 'cloud': style = 'ellipse;shape=cloud;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;'; width = 140; break;
                case 'artifact': style = 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#fff2cc;strokeColor=#d6b656;'; break;
                default: style = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
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
            const style = conn.isDashed ? 'endArrow=classic;html=1;rounded=0;dashed=1;' : 'endArrow=classic;html=1;rounded=0;';
            xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(conn.label)}" style="${style}" edge="1" parent="1" source="${source.id}" target="${target.id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
        }
        return xml;
    }

    // ==================== Class Diagram ====================
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
            const fillColor = cls.type === 'interface' ? '#d5e8d4' : cls.type === 'abstract' ? '#fff2cc' : cls.type === 'enum' ? '#e1d5e7' : '#dae8fc';
            const strokeColor = cls.type === 'interface' ? '#82b366' : cls.type === 'abstract' ? '#d6b656' : cls.type === 'enum' ? '#9673a6' : '#6c8ebf';
            xml += `        <mxCell id="${id}" value="${this.escapeXml(cls.name)}" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;fillColor=${fillColor};strokeColor=${strokeColor};" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>\n`;
            let memberY = 26;
            for (const attr of cls.attributes) {
                const attrId = this.cellId++;
                xml += `        <mxCell id="${attrId}" value="${this.escapeXml(attr.visibility + ' ' + attr.name + (attr.type ? ': ' + attr.type : ''))}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="${id}">
          <mxGeometry y="${memberY}" width="${width}" height="20" as="geometry"/>
        </mxCell>\n`;
                memberY += 20;
            }
            if (cls.attributes.length > 0 && cls.methods.length > 0) {
                xml += `        <mxCell id="${this.cellId++}" value="" style="line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;" vertex="1" parent="${id}">
          <mxGeometry y="${memberY}" width="${width}" height="8" as="geometry"/>
        </mxCell>\n`;
                memberY += 8;
            }
            for (const method of cls.methods) {
                xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(method.visibility + ' ' + method.name + (method.type ? ': ' + method.type : ''))}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="${id}">
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
        return xml;
    }

    generateEdges() {
        let xml = '';
        const styles = {
            'extends': 'endArrow=block;endSize=16;endFill=0;html=1;rounded=0;',
            'implements': 'endArrow=block;endSize=16;endFill=0;html=1;rounded=0;dashed=1;',
            'composition': 'endArrow=diamondThin;endFill=1;endSize=24;html=1;rounded=0;',
            'aggregation': 'endArrow=diamondThin;endFill=0;endSize=24;html=1;rounded=0;',
            'association': 'endArrow=open;endSize=12;html=1;rounded=0;',
            'dependency': 'endArrow=open;endSize=12;html=1;rounded=0;dashed=1;'
        };
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            if (!source || !target) continue;
            xml += `        <mxCell id="${this.cellId++}" value="${this.escapeXml(rel.label || '')}" style="${styles[rel.type] || styles['association']}" edge="1" parent="1" source="${source.id}" target="${target.id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
        }
        return xml;
    }

    escapeXml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    wrapInDrawioFormat(content, compressed = false) {
        const timestamp = new Date().toISOString();
        // Remove extra whitespace from content to create cleaner XML
        const cleanContent = content.replace(/\n\s*/g, '').trim();
        const mxGraphModel = `<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cleanContent}</root></mxGraphModel>`;
        
        if (compressed) {
            // Compressed format for better compatibility
            const encodedContent = this.compressAndEncode(mxGraphModel);
            return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${timestamp}" agent="Mozilla/5.0" etag="plantuml2drawio" version="21.6.5" type="device">
  <diagram id="diagram-1" name="Page-1">${encodedContent}</diagram>
</mxfile>`;
        }
        
        // Uncompressed format - no extra whitespace
        return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${timestamp}" agent="Mozilla/5.0" etag="plantuml2drawio" version="21.6.5" type="device">
  <diagram id="diagram-1" name="Page-1">
    ${mxGraphModel}
  </diagram>
</mxfile>`;
    }

    compressAndEncode(data) {
        // Use pako for deflate compression if available, otherwise return base64
        try {
            if (typeof pako !== 'undefined') {
                const compressed = pako.deflateRaw(encodeURIComponent(data));
                return btoa(String.fromCharCode.apply(null, compressed));
            }
        } catch (e) {
            console.warn('Compression failed, using uncompressed format');
        }
        // Fallback: just encode without compression
        return btoa(unescape(encodeURIComponent(data)));
    }
}

// ==================== Preview Renderer ====================
class PreviewRenderer {
    constructor(parsedData) { this.data = parsedData; this.nodePositions = new Map(); }

    render() {
        switch (this.data.type) {
            case 'activity': return this.renderActivityDiagram();
            case 'sequence': return this.renderSequenceDiagram();
            case 'state': return this.renderStateDiagram();
            case 'mindmap': return this.renderMindMap();
            case 'er': return this.renderERDiagram();
            case 'deployment': return this.renderDeploymentDiagram();
            case 'usecase': return this.renderUseCaseDiagram();
            default: return this.renderClassDiagram();
        }
    }

    renderActivityDiagram() {
        let svg = '';
        const hasSwimlanes = this.data.swimlanes?.length > 0;
        const swimlaneWidth = 200;
        let y = 30, maxX = 400;
        
        if (hasSwimlanes) {
            let swimlaneX = 10;
            const swimlaneHeight = 80 + this.data.activities.length * 60;
            for (const swimlane of this.data.swimlanes) {
                svg += `<rect x="${swimlaneX}" y="10" width="${swimlaneWidth}" height="${swimlaneHeight}" fill="${swimlane.color || '#f5f5f5'}" stroke="#999" stroke-width="1"/>`;
                svg += `<text x="${swimlaneX + 10}" y="30" font-size="12" font-weight="bold" fill="#333">${this.escapeXml(swimlane.label)}</text>`;
                swimlane.x = swimlaneX;
                swimlaneX += swimlaneWidth;
                maxX = Math.max(maxX, swimlaneX);
            }
            y = 50;
        }
        
        for (const activity of this.data.activities) {
            if (activity.type === 'else_marker' || activity.type === 'elseif_marker') continue;
            let x = 180;
            if (hasSwimlanes && activity.swimlane !== null && this.data.swimlanes[activity.swimlane]) x = this.data.swimlanes[activity.swimlane].x + swimlaneWidth / 2;
            this.nodePositions.set(activity.id, { x, y });
            
            switch (activity.type) {
                case 'start': svg += `<circle cx="${x}" cy="${y}" r="12" fill="#333"/>`; y += 40; break;
                case 'end': svg += `<circle cx="${x}" cy="${y}" r="10" fill="#333"/><circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#333" stroke-width="2"/>`; y += 40; break;
                case 'action':
                    const width = Math.max(100, activity.label.length * 7 + 16);
                    svg += `<rect x="${x - width/2}" y="${y - 15}" width="${width}" height="30" rx="8" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
                    svg += `<text x="${x}" y="${y + 4}" class="label" text-anchor="middle" font-size="11">${this.escapeXml(activity.label)}</text>`;
                    y += 55; break;
                case 'decision':
                    svg += `<polygon points="${x},${y - 20} ${x + 35},${y} ${x},${y + 20} ${x - 35},${y}" fill="#fff2cc" stroke="#d6b656" stroke-width="2"/>`;
                    svg += `<text x="${x}" y="${y + 4}" class="label" text-anchor="middle" font-size="9">${this.escapeXml(activity.label.substring(0, 12))}</text>`;
                    y += 55; break;
                case 'merge': svg += `<polygon points="${x},${y - 8} ${x + 12},${y} ${x},${y + 8} ${x - 12},${y}" fill="#f5f5f5" stroke="#666" stroke-width="2"/>`; y += 30; break;
                case 'fork': svg += `<rect x="${x - 40}" y="${y - 2}" width="80" height="4" fill="#333"/>`; y += 25; break;
            }
        }
        
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from);
            const target = this.nodePositions.get(rel.to);
            if (source && target) svg += `<line x1="${source.x}" y1="${source.y + 15}" x2="${target.x}" y2="${target.y - 15}" stroke="#666" stroke-width="1.5" marker-end="url(#arrow)"/>`;
        }
        return this.wrapSvg(svg, maxX + 50, y + 30);
    }

    renderSequenceDiagram() {
        let svg = '';
        const participantSpacing = 150, participantWidth = 100, messageSpacing = 40;
        this.data.participants.forEach((p, i) => {
            const x = 50 + i * participantSpacing;
            this.nodePositions.set(p.name, { x: x + participantWidth/2 });
            if (p.type === 'actor') {
                svg += `<circle cx="${x + participantWidth/2}" cy="25" r="12" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
                svg += `<line x1="${x + participantWidth/2}" y1="37" x2="${x + participantWidth/2}" y2="55" stroke="#6c8ebf" stroke-width="2"/>`;
                svg += `<line x1="${x + participantWidth/2 - 15}" y1="45" x2="${x + participantWidth/2 + 15}" y2="45" stroke="#6c8ebf" stroke-width="2"/>`;
                svg += `<line x1="${x + participantWidth/2}" y1="55" x2="${x + participantWidth/2 - 10}" y2="70" stroke="#6c8ebf" stroke-width="2"/>`;
                svg += `<line x1="${x + participantWidth/2}" y1="55" x2="${x + participantWidth/2 + 10}" y2="70" stroke="#6c8ebf" stroke-width="2"/>`;
            } else {
                svg += `<rect x="${x}" y="10" width="${participantWidth}" height="35" rx="3" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            }
            svg += `<text x="${x + participantWidth/2}" y="32" class="label" text-anchor="middle">${this.escapeXml(p.label)}</text>`;
            const lifelineHeight = 60 + this.data.messages.length * messageSpacing;
            svg += `<line x1="${x + participantWidth/2}" y1="45" x2="${x + participantWidth/2}" y2="${45 + lifelineHeight}" stroke="#999" stroke-width="1" stroke-dasharray="5,5"/>`;
        });
        let msgY = 70;
        for (const msg of this.data.messages) {
            const fromPos = this.nodePositions.get(msg.from), toPos = this.nodePositions.get(msg.to);
            if (fromPos && toPos) {
                svg += `<line x1="${fromPos.x}" y1="${msgY}" x2="${toPos.x}" y2="${msgY}" stroke="#666" stroke-width="1.5" ${msg.isDashed ? 'stroke-dasharray="5,5"' : ''} marker-end="url(#arrow)"/>`;
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
            if (state.type === 'start') svg += `<circle cx="${x + 15}" cy="${y + 15}" r="12" fill="#333"/>`;
            else if (state.type === 'end') { svg += `<circle cx="${x + 15}" cy="${y + 15}" r="10" fill="#333"/><circle cx="${x + 15}" cy="${y + 15}" r="15" fill="none" stroke="#333" stroke-width="2"/>`; }
            else {
                const width = Math.max(100, state.label.length * 7 + 16);
                svg += `<rect x="${x}" y="${y}" width="${width}" height="50" rx="10" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
                svg += `<text x="${x + width/2}" y="${y + 30}" class="label" text-anchor="middle">${this.escapeXml(state.label)}</text>`;
            }
            count++;
            if (count % 4 === 0) { x = 50; y += 100; } else { x += spacing; }
        }
        for (const trans of this.data.transitions) {
            let fromKey = trans.from === '[*]' ? '[*]_start' : trans.from;
            let toKey = trans.to === '[*]' ? '[*]_end' : trans.to;
            const source = this.nodePositions.get(fromKey) || this.nodePositions.get(trans.from);
            const target = this.nodePositions.get(toKey) || this.nodePositions.get(trans.to);
            if (source && target) svg += `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#666" stroke-width="1.5" marker-end="url(#arrow)"/>`;
        }
        return this.wrapSvg(svg, x + 150, y + 100);
    }

    renderUseCaseDiagram() {
        let svg = '';
        let actorY = 80, usecaseY = 50;
        for (const actor of this.data.actors) {
            this.nodePositions.set(actor.name, { x: 65, y: actorY + 30 });
            svg += `<circle cx="65" cy="${actorY + 10}" r="12" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<line x1="65" y1="${actorY + 22}" x2="65" y2="${actorY + 45}" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<line x1="45" y1="${actorY + 32}" x2="85" y2="${actorY + 32}" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<line x1="65" y1="${actorY + 45}" x2="50" y2="${actorY + 65}" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<line x1="65" y1="${actorY + 45}" x2="80" y2="${actorY + 65}" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<text x="65" y="${actorY + 80}" class="label" text-anchor="middle">${this.escapeXml(actor.label)}</text>`;
            actorY += 100;
        }
        for (const uc of this.data.usecases) {
            this.nodePositions.set(uc.name, { x: 260, y: usecaseY + 25 });
            svg += `<ellipse cx="260" cy="${usecaseY + 25}" rx="70" ry="25" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<text x="260" y="${usecaseY + 30}" class="label" text-anchor="middle" font-size="11">${this.escapeXml(uc.label)}</text>`;
            usecaseY += 60;
        }
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from), target = this.nodePositions.get(rel.to);
            if (source && target) svg += `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#666" stroke-width="1.5"/>`;
        }
        return this.wrapSvg(svg, 380, Math.max(actorY, usecaseY) + 30);
    }

    renderMindMap() {
        let svg = '';
        const centerX = 250, centerY = 150;
        const levelSpacing = 130;
        let rightY = centerY - 60, leftY = centerY - 60;
        for (const node of this.data.mindmap) {
            let x, y, width = Math.max(70, node.text.length * 7 + 14);
            if (node.level === 1) { x = centerX - width/2; y = centerY - 12; }
            else {
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
            } else svg += `<rect x="${x}" y="${y}" width="100" height="70" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<text x="${x + 50}" y="${y + 40}" class="label" text-anchor="middle" font-size="11">${this.escapeXml(node.label)}</text>`;
            count++;
            if (count % 4 === 0) { x = 30; y += 100; } else { x += spacing; }
        }
        for (const conn of this.data.connections) {
            const source = this.nodePositions.get(conn.from), target = this.nodePositions.get(conn.to);
            if (source && target) svg += `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#666" stroke-width="1.5" marker-end="url(#arrow)"/>`;
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
            svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<rect x="${x}" y="${y}" width="${width}" height="22" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>`;
            svg += `<text x="${x + width/2}" y="${y + 15}" class="label" text-anchor="middle" font-weight="bold" font-size="11">${this.escapeXml(cls.name)}</text>`;
            let memberY = y + 36;
            for (const attr of cls.attributes) { svg += `<text x="${x + 6}" y="${memberY}" class="label" font-size="10">${attr.visibility} ${this.escapeXml(attr.name)}</text>`; memberY += 16; }
            for (const method of cls.methods) { svg += `<text x="${x + 6}" y="${memberY}" class="label" font-size="10">${method.visibility} ${this.escapeXml(method.name)}</text>`; memberY += 16; }
            count++;
            if (count % 3 === 0) { x = 40; y += height + 50; } else { x += spacing; }
        }
        for (const rel of this.data.relations) {
            const source = this.nodePositions.get(rel.from), target = this.nodePositions.get(rel.to);
            if (source && target) svg += `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#666" stroke-width="1.5" ${(rel.type === 'implements' || rel.type === 'dependency') ? 'stroke-dasharray="5,5"' : ''} marker-end="url(#arrow)"/>`;
        }
        return this.wrapSvg(svg, x + 180, y + 120);
    }

    wrapSvg(content, width, height) {
        return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#666"/></marker></defs>
            ${content}
        </svg>`;
    }

    escapeXml(str) { return str ? str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }
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
        const hasElements = parsed.classes?.length > 0 || parsed.actors?.length > 0 || parsed.usecases?.length > 0 || parsed.components?.length > 0 || parsed.nodes?.length > 0 || parsed.activities?.length > 0 || parsed.participants?.length > 0 || parsed.states?.length > 0 || parsed.mindmap?.length > 0 || parsed.entities?.length > 0 || parsed.deployments?.length > 0;
        if (!hasElements) { showStatus('No valid elements found in PlantUML code', 'error'); return; }
        const generator = new DrawioGenerator(parsed);
        outputEl.value = generator.generate();
        const renderer = new PreviewRenderer(parsed);
        previewEl.innerHTML = renderer.render();
        const info = [];
        if (parsed.swimlanes?.length > 0) info.push(`${parsed.swimlanes.length} swimlanes`);
        if (parsed.partitions?.length > 0) info.push(`${parsed.partitions.length} partitions`);
        showStatus(`Successfully converted ${parsed.type} diagram${info.length > 0 ? ' with ' + info.join(', ') : ''}!`, 'success');
    } catch (error) { showStatus('Error: ' + error.message, 'error'); console.error(error); }
}

function downloadDrawio(compressed = false) {
    const input = document.getElementById('plantuml-input').value.trim();
    if (!input) { showStatus('Please convert PlantUML first', 'error'); return; }
    
    try {
        const parser = new PlantUMLParser(input);
        const parsed = parser.parse();
        const generator = new DrawioGenerator(parsed);
        const output = generator.generate(compressed);
        
        const blob = new Blob([output], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = compressed ? 'diagram_feishu.drawio' : 'diagram.drawio';
        a.click();
        URL.revokeObjectURL(url);
        showStatus(compressed ? 'Feishu compatible file downloaded!' : 'File downloaded!', 'success');
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

function copyOutput() { document.getElementById('drawio-output').select(); document.execCommand('copy'); showStatus('Copied to clipboard!', 'success'); }
function clearAll() { document.getElementById('plantuml-input').value = ''; document.getElementById('drawio-output').value = ''; document.getElementById('preview').innerHTML = ''; document.getElementById('status').className = 'status'; }

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
actor 用户 as user
participant "C端小程序" as app
participant "后台系统" as sys
actor 客服 as cs

== 下单阶段 ==
user -> app : 选择商品
user -> app : 上传定制素材
app -> sys : 创建订单
sys --> app : 返回支付链接
user -> app : 完成支付

== 审核阶段 ==
cs -> sys : 查看待审核订单
cs -> sys : 审核定制内容
alt 审核通过
  cs -> sys : 确认通过
else 需要修改
  cs -> sys : 驳回并填写原因
  sys -> app : 通知用户修改
end
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
  elseif (需客户修改) then (驳回)
    :待修改;
  else (帮客户修改)
    :客服修改;
  endif
}

:订单完成;
stop
@enduml`,
        'state': `@startuml
[*] --> 待支付 : 用户下单

待支付 --> 待审核 : 全款支付成功
待支付 --> 待支付尾款 : 定金支付成功
待支付 --> 已取消 : 取消订单

待支付尾款 --> 待审核 : 尾款支付成功
待审核 --> 待分配 : 审核通过
待审核 --> 待修改 : 审核驳回

待分配 --> 生产中 : 分配任务
note right of 生产中
  内部阶段:
  制作中→质检中→打包中
end note

生产中 --> 待发货 : 打包完成
待发货 --> 待签收 : 确认发货
待签收 --> 已完成 : 确认签收

已完成 --> [*]
已取消 --> [*]
@enduml`,
        'usecase': `@startuml
actor "超级管理员" as admin
actor "客服专员" as cs
actor "生产主管" as pm

rectangle "订单管理" {
  usecase "查看订单" as ov
  usecase "订单审核" as oa
}

rectangle "生产管理" {
  usecase "分配任务" as pa
  usecase "更新进度" as pu
}

admin --> ov
admin --> oa
admin --> pa
admin --> pu
cs --> ov
cs --> oa
pm --> pa
pm --> pu
@enduml`,
        'mindmap': `@startmindmap
+ 项目规划
++ 需求分析
+++ 用户调研
+++ 竞品分析
++ 设计阶段
+++ UI设计
+++ 架构设计
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

function showStatus(message, type) { const statusEl = document.getElementById('status'); statusEl.textContent = message; statusEl.className = 'status ' + type; }
