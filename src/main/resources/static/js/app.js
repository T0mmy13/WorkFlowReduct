const { createApp, ref, onMounted, reactive, watch, nextTick } = Vue;

createApp({
    setup() {
        const editor = ref(null);
        let jsPlumbInstance = null;
        let selectedNode = null;
        let isSaving = false;

        const diagramName = ref("workflow.yml");
        const isSaved = ref(true);
        const diagramHash = ref("");
        const showEditor = ref(false);
        const editingNode = ref(null);
        const editingDialog = reactive({
            message_timeout: 120,
            commands: []
        });

        const nodes = ref([]);
        const connections = ref([]);

        watch(diagramHash, (newHash, oldHash) => {
            if (oldHash && newHash !== oldHash) {
                isSaved.value = false;
            }
        });

        onMounted(async () => {
            jsPlumbInstance = jsPlumb.getInstance({
                Connector: ["Flowchart", { cornerRadius: 5 }],
                PaintStyle: {
                    stroke: "#456",
                    strokeWidth: 2,
                    opacity: 1
                },
                Endpoint: [
                    "Dot",
                    {
                        radius: 5,
                        cssClass: "jtk-endpoint",
                        hoverClass: "jtk-endpoint-hover"
                    }
                ],
                HoverPaintStyle: { stroke: "#222", strokeWidth: 3 },
                ConnectionOverlays: [
                    ["Arrow", { location: 1, width: 10, length: 10 }]
                ]
            });
            jsPlumbInstance.setContainer(editor.value);

            try {
                const nameResponse = await fetch('/api/diagram/name');
                if (!nameResponse.ok) throw new Error('Failed to load name');
                const nameData = await nameResponse.json();
                diagramName.value = nameData.name;
            } catch (error) {
                console.error('Ошибка загрузки имени файла:', error);
            }

            await loadDiagram();

            document.addEventListener('keydown', handleKeyDown);
            document.addEventListener('mousedown', handleBackgroundClick);

            setInterval(() => {
                if (!isSaved.value && !isSaving) {
                    saveDiagram();
                }
            }, 30000);
        });

        function handleBackgroundClick(e) {
            if (e.target === editor.value && selectedNode) {
                selectedNode.classList.remove('selected');
                selectedNode = null;
            }
        }

        function setupNodeListeners(node) {
            node.addEventListener('dblclick', (e) => {
                if (!e.target.classList.contains('resizer')) {
                    openEditor(node);
                }
            });

            node.addEventListener('click', (e) => {
                if (!e.target.classList.contains('resizer')) {
                    selectNode(node);
                }
            });
        }

        function openEditor(node) {
            const nodeId = node.id;
            editingNode.value = nodes.value.find(n => n.id === nodeId);
            editingNode.value.originalId = nodeId;

            if (editingNode.value.id === '@START') {
                if (editingNode.value.dialog) {
                    editingDialog.message_timeout = editingNode.value.dialog.message_timeout || 120;
                    editingDialog.commands = editingNode.value.dialog.commands.map(cmd => ({
                        answerStr: cmd.answer?.join(', ') || '',
                        node_to: cmd.node_to || ''
                    }));
                } else {
                    editingDialog.message_timeout = 120;
                }
            } else if (editingNode.value.type === 'decision') {
                editingNode.value.options = (editingNode.value.options || []).map(option =>
                    reactive({
                        ...option,
                        answerStr: option.answer ? option.answer.join(', ') : ''
                    })
                );
            }

            showEditor.value = true;
        }

        function closeEditor() {
            showEditor.value = false;
            editingNode.value = null;
        }

        function saveNodeChanges() {
            const oldId = editingNode.value.originalId;
            const newId = editingNode.value.id;

            if (oldId !== newId) {
                const nodeElement = document.getElementById(oldId);
                if (nodeElement) {
                    nodeElement.id = newId;
                }
            }

            connections.value.forEach(conn => {
                if (conn.sourceId === oldId) conn.sourceId = newId;
                if (conn.targetId === oldId) conn.targetId = newId;
            });

            if (editingNode.value.id === '@START') {
                const commands = editingDialog.commands.map(cmd => ({
                    answer: cmd.answerStr.split(',').map(s => s.trim()).filter(s => s),
                    node_to: cmd.node_to
                }));

                editingNode.value.dialog = {
                    message_timeout: editingDialog.message_timeout,
                    commands: commands
                };

                connections.value = connections.value.filter(conn => conn.sourceId !== '@START');
                commands.forEach(cmd => {
                    if (cmd.node_to) {
                        connections.value.push({
                            sourceId: '@START',
                            targetId: cmd.node_to,
                            sourceAnchor: "Bottom",
                            targetAnchor: "Top"
                        });
                    }
                });
            } else if (editingNode.value.type === 'process') {
                connections.value = connections.value.filter(conn => conn.sourceId !== editingNode.value.id);
                if (editingNode.value.node_to) {
                    connections.value.push({
                        sourceId: editingNode.value.id,
                        targetId: editingNode.value.node_to,
                        sourceAnchor: "Bottom",
                        targetAnchor: "Top"
                    });
                }
            } else if (editingNode.value.type === 'decision') {
                editingNode.value.options = editingNode.value.options.map(option => ({
                    answer: option.answerStr.split(',').map(a => a.trim()).filter(a => a),
                    node_to: option.node_to
                }));

                connections.value = connections.value.filter(conn => conn.sourceId !== editingNode.value.id);
                editingNode.value.options.forEach(option => {
                    if (option.node_to) {
                        connections.value.push({
                            sourceId: editingNode.value.id,
                            targetId: option.node_to,
                            sourceAnchor: "Bottom",
                            targetAnchor: "Top"
                        });
                    }
                });
            }

            updateNodeVisual(editingNode.value);
            updateDiagramHash();
            closeEditor();

            nextTick(() => {
                refreshConnections();
                jsPlumbInstance.repaintEverything();
            });
        }

        function refreshConnections() {
            jsPlumbInstance.deleteEveryConnection();
            connections.value.forEach(conn => {
                const source = document.getElementById(conn.sourceId);
                const target = document.getElementById(conn.targetId);
                if (source && target) {
                    jsPlumbInstance.connect({
                        source: source,
                        target: target,
                        anchors: [conn.sourceAnchor, conn.targetAnchor],
                        paintStyle: {
                            stroke: "#456",
                            strokeWidth: 2,
                            opacity: 1
                        }
                    });
                }
            });
            jsPlumbInstance.repaintEverything();
        }

        function updateNodeVisual(nodeData) {
            const nodeElement = document.getElementById(nodeData.id);
            if (nodeElement) {
                const content = nodeElement.querySelector('.node-content');
                if (content) {
                    if (nodeData.type !== 'terminal') {
                        content.textContent = nodeData.title || nodeData.id;
                    } else {
                        content.textContent = nodeData.text || nodeData.id;
                    }
                }
            }
        }

        function availableTargetNodes(currentNodeId) {
            return nodes.value.filter(node => node.id !== currentNodeId);
        }

        function addCommand() {
            editingDialog.commands.push({
                answerStr: '',
                node_to: ''
            });
        }

        function removeCommand(index) {
            editingDialog.commands.splice(index, 1);
        }

        function addOption() {
            if (!editingNode.value.options) {
                editingNode.value.options = [];
            }
            editingNode.value.options.push({
                answerStr: '',
                node_to: ''
            });
        }

        function removeOption(index) {
            editingNode.value.options.splice(index, 1);
        }

        function addNode(type) {
            if (type === 'terminal') {
                const hasBegin = nodes.value.some(n => n.id === '@START');
                const hasStop = nodes.value.some(n => n.id === '@END');

                if (hasBegin && hasStop) {
                    alert('Максимальное количество терминальных узлов - 2 (@START и @END)');
                    return;
                }

                const nodeId = hasBegin ? '@END' : '@START';
                const nodeText = hasBegin ? 'Конец' : 'Начало';

                const node = document.createElement('div');
                node.className = 'node terminal';
                node.style.left = '100px';
                node.style.top = '100px';
                node.style.width = '80px';
                node.style.height = '80px';
                node.id = nodeId;

                const content = document.createElement('div');
                content.className = 'node-content';
                content.textContent = nodeText;

                let newNodeData = reactive({
                    id: nodeId,
                    type: 'terminal',
                    x: 100,
                    y: 100,
                    width: 80,
                    height: 80,
                    text: nodeText
                });

                if (nodeId === '@START') {
                    newNodeData.dialog = {
                        message_timeout: 120,
                    };
                } else {
                    newNodeData.success_ending = false;
                }

                nodes.value.push(newNodeData);
                node.appendChild(content);
                editor.value.appendChild(node);

                setupNodeListeners(node);
                addResizers(node);
                setupJsPlumb(node);

                nextTick(() => {
                    updateNodeVisual(newNodeData);
                    selectNode(node);
                });

                updateDiagramHash();
                return;
            }

            const node = document.createElement('div');
            const nodeId = 'node-' + Date.now();
            const nodeClass = type === 'decision' ? 'decision' : 'process';

            node.className = `node ${nodeClass}`;
            node.style.left = '100px';
            node.style.top = '100px';

            if (type === 'decision') {
                node.style.width = '120px';
                node.style.height = '120px';
            } else {
                node.style.width = '120px';
                node.style.height = '80px';
            }

            node.id = nodeId;

            const content = document.createElement('div');
            content.className = 'node-content';
            content.textContent = nodeId;

            let newNodeData = reactive({
                id: nodeId,
                type: type,
                x: 100,
                y: 100,
                width: type === 'decision' ? 120 : 120,
                height: type === 'decision' ? 120 : 80,
                message_timeout: 120,
                contact_type: "message"
            });

            nodes.value.push(newNodeData);
            node.appendChild(content);
            editor.value.appendChild(node);

            setupNodeListeners(node);
            addResizers(node);
            setupJsPlumb(node);

            nextTick(() => {
                updateNodeVisual(newNodeData);
                selectNode(node);
            });

            updateDiagramHash();
        }

        function setupJsPlumb(node) {
            jsPlumbInstance.draggable(node, {
                filter: ".resizer",
                preventDefault: true,
                drag: function() {
                    jsPlumbInstance.repaint(node);
                },
                stop: function() {
                    const nodeData = nodes.value.find(n => n.id === node.id);
                    if (nodeData) {
                        nodeData.x = node.offsetLeft;
                        nodeData.y = node.offsetTop;
                    }
                    jsPlumbInstance.repaint(node);
                    updateDiagramHash();
                }
            });
        }

        function addResizers(node) {
            const positions = ['nw', 'ne', 'se', 'sw'];
            positions.forEach(pos => {
                const resizer = document.createElement('div');
                resizer.className = `resizer resizer-${pos}`;
                resizer.addEventListener('mousedown', (e) => startResize(e, node, pos));
                node.appendChild(resizer);
            });
        }

        function startResize(e, node, handle) {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = node.offsetWidth;
            const startHeight = node.offsetHeight;
            const startLeft = node.offsetLeft;
            const startTop = node.offsetTop;

            const isDecision = node.classList.contains('decision');

            function doResize(e) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                let newWidth = startWidth;
                let newHeight = startHeight;
                let newLeft = startLeft;
                let newTop = startTop;

                if (isDecision) {
                    switch(handle) {
                        case 'nw':
                        case 'ne':
                        case 'sw':
                        case 'se':
                            newWidth = Math.max(100, startWidth + dx);
                            newHeight = newWidth;
                            break;
                    }
                } else {
                    switch(handle) {
                        case 'nw':
                            newWidth = Math.max(50, startWidth - dx);
                            newHeight = Math.max(30, startHeight - dy);
                            newLeft = startLeft + dx;
                            newTop = startTop + dy;
                            break;
                        case 'ne':
                            newWidth = Math.max(50, startWidth + dx);
                            newHeight = Math.max(30, startHeight - dy);
                            newTop = startTop + dy;
                            break;
                        case 'se':
                            newWidth = Math.max(50, startWidth + dx);
                            newHeight = Math.max(30, startHeight + dy);
                            break;
                        case 'sw':
                            newWidth = Math.max(50, startWidth - dx);
                            newHeight = Math.max(30, startHeight + dy);
                            newLeft = startLeft + dx;
                            break;
                    }
                }

                node.style.width = `${newWidth}px`;
                node.style.height = `${newHeight}px`;
                node.style.left = `${newLeft}px`;
                node.style.top = `${newTop}px`;

                const nodeData = nodes.value.find(n => n.id === node.id);
                if (nodeData) {
                    nodeData.width = newWidth;
                    nodeData.height = newHeight;
                    nodeData.x = newLeft;
                    nodeData.y = newTop;
                }

                jsPlumbInstance.revalidate(node);
            }

            function stopResize() {
                document.removeEventListener('mousemove', doResize);
                document.removeEventListener('mouseup', stopResize);
                updateDiagramHash();
            }

            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
        }

        function selectNode(node) {
            if (selectedNode) {
                selectedNode.classList.remove('selected');
            }
            selectedNode = node;
            node.classList.add('selected');
        }

        function deleteSelectedNode() {
            if (selectedNode) {
                if (selectedNode.id === '@START' || selectedNode.id === '@END') {
                    alert('Нельзя удалить системные узлы @START и @END');
                    return;
                }

                connections.value = connections.value.filter(
                    conn => conn.sourceId !== selectedNode.id && conn.targetId !== selectedNode.id
                );

                nodes.value = nodes.value.filter(n => n.id !== selectedNode.id);

                selectedNode.remove();
                selectedNode = null;

                updateDiagramHash();
                refreshConnections();
            }
        }

        function handleKeyDown(e) {
            if (e.key === 'Delete') {
                deleteSelectedNode();
            }
        }

        async function loadDiagram() {
            try {
                const response = await fetch('/api/diagram');
                if (!response.ok) throw new Error('Failed to load diagram');
                const diagramData = await response.json();

                document.querySelectorAll('.node').forEach(node => node.remove());
                jsPlumbInstance.deleteEveryConnection();

                nodes.value = (diagramData.nodes || []).map(node => {
                    if (node.type === 'decision' && node.options) {
                        return reactive({
                            ...node,
                            options: node.options.map(option =>
                                reactive({
                                    ...option,
                                    answerStr: option.answer ? option.answer.join(', ') : ''
                                })
                            )
                        });
                    }

                    if (node.type === 'process') {
                        const connection = diagramData.connections.find(c => c.sourceId === node.id);
                        return reactive({
                            ...node,
                            node_to: connection ? connection.targetId : null
                        });
                    }

                    if (node.id === '@START' && node.dialog) {
                        return reactive({
                            ...node,
                            dialog: {
                                ...node.dialog,
                                commands: node.dialog.commands.map(cmd => ({
                                    ...cmd,
                                    answerStr: cmd.answer?.join(', ') || ''
                                }))
                            }
                        });
                    }

                    return reactive(node);
                });

                connections.value = diagramData.connections || [];

                nodes.value.forEach(nodeData => {
                    const node = document.createElement('div');
                    const nodeClass = nodeData.type === 'decision' ? 'decision' :
                                      nodeData.type === 'terminal' ? 'terminal' : 'process';

                    node.className = `node ${nodeClass}`;
                    node.id = nodeData.id;
                    node.style.left = `${nodeData.x}px`;
                    node.style.top = `${nodeData.y}px`;
                    node.style.width = `${nodeData.width}px`;
                    node.style.height = `${nodeData.height}px`;

                    const content = document.createElement('div');
                    content.className = 'node-content';
                    if (nodeData.type !== 'terminal') {
                        content.textContent = nodeData.title || nodeData.id;
                    } else {
                        content.textContent = nodeData.text || nodeData.id;
                    }

                    node.appendChild(content);
                    editor.value.appendChild(node);

                    setupNodeListeners(node);
                    addResizers(node);
                    setupJsPlumb(node);
                });

                refreshConnections();
                updateDiagramHash();
                isSaved.value = true;

            } catch (error) {
                console.error('Ошибка загрузки схемы:', error);
                alert('Ошибка загрузки схемы: ' + error.message);
            }
        }

        function updateDiagramHash() {
            const nodesData = nodes.value.map(node => {
                const data = { ...node };

                if (node.type === 'decision' && node.options) {
                    data.options = node.options.map(option => ({
                        answer: option.answer || [],
                        node_to: option.node_to
                    }));
                }

                if (node.id === '@START' && node.dialog) {
                    data.dialog = {
                        ...node.dialog,
                        commands: node.dialog.commands.map(cmd => ({
                            answer: cmd.answer || [],
                            node_to: cmd.node_to
                        }))
                    };
                }

                return data;
            });

            const diagramState = {
                nodes: nodesData,
                connections: connections.value
            };

            diagramHash.value = JSON.stringify(diagramState);
        }

        async function saveDiagram() {
            if (isSaving) return;
            isSaving = true;

            const nodesData = nodes.value.map(node => {
                const data = { ...node };

                if (node.type === 'decision' && node.options) {
                    data.options = node.options.map(option => ({
                        answer: option.answer || [],
                        node_to: option.node_to
                    }));
                }

                if (node.id === '@START' && node.dialog) {
                    data.dialog = {
                        ...node.dialog,
                        commands: node.dialog.commands.map(cmd => ({
                            answer: cmd.answer || [],
                            node_to: cmd.node_to
                        }))
                    };
                }

                return data;
            });

            try {
                const response = await fetch('/api/diagram', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nodes: nodesData,
                        connections: connections.value
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                isSaved.value = true;
                diagramHash.value = result.hash;

            } catch (error) {
                console.error('Ошибка сохранения схемы:', error);
                alert('Ошибка при сохранении: ' + error.message);
            } finally {
                isSaving = false;
            }
        }

        return {
            editor,
            diagramName,
            isSaved,
            showEditor,
            editingNode,
            editingDialog,
            nodes,
            addNode,
            saveDiagram,
            deleteSelectedNode,
            openEditor,
            closeEditor,
            saveNodeChanges,
            addCommand,
            removeCommand,
            addOption,
            removeOption,
            availableTargetNodes
        };
    }
}).mount('#app');