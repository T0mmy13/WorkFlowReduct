package com.example.demo.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.springframework.stereotype.Service
import java.io.File
import javax.annotation.PostConstruct
import java.security.MessageDigest

@Service
class DiagramService {
    private lateinit var diagramFile: File
    var lastSavedHash: String = ""

    data class Diagram(
        val nodes: List<Node> = emptyList(),
        val connections: List<Connection> = emptyList()
    )

    data class Node(
        val id: String,
        val type: String,
        val message_timeout: Int? = null,
        val contact_type: String? = null,
        val title: String? = null,
        var text: String? = null,
        val options: List<Option>? = null,
        val success_ending: Boolean? = null,
        val x: Int = 0,
        val y: Int = 0,
        val width: Int = 100,
        val height: Int = 80,
        val dialog: Dialog? = null,
        val node_to: String? = null
    )

    data class Dialog(
        val message_timeout: Int = 120,
        val commands: List<Command> = emptyList()
    )

    data class Command(
        val answer: List<String> = emptyList(),
        val node_to: String = ""
    )

    data class Option(
        val answer: List<String> = emptyList(),
        val node_to: String = ""
    )

    data class Connection(
        val sourceId: String,
        val targetId: String,
        val sourceAnchor: String = "Bottom",
        val targetAnchor: String = "Top"
    )

    @PostConstruct
    fun init() {
        val basePath = "src/main/resources/scheme/"
        val dir = File(basePath)
        if (!dir.exists()) dir.mkdirs()

        diagramFile = File(dir, "workflow.yml")
        if (!diagramFile.exists()) {
            diagramFile.createNewFile()
            val startNode = Node(
                id = "@START",
                type = "terminal",
                text = "Начало",
                x = 100,
                y = 100,
                width = 80,
                height = 80,
                dialog = Dialog(
                    message_timeout = 120,
                    commands = listOf(
                        Command(
                            answer = listOf(""),
                            node_to = ""
                        )
                    )
                )
            )

            val stopNode = Node(
                id = "@END",
                type = "terminal",
                text = "Конец",
                success_ending = false,
                x = 500,
                y = 100,
                width = 80,
                height = 80
            )

            saveDiagram(Diagram(
                nodes = listOf(startNode, stopNode),
                connections = emptyList()
            ))
        }
    }

    fun loadDiagram(): Diagram {
        return try {
            if (!diagramFile.exists() || diagramFile.length() == 0L) {
                return Diagram()
            }
            ObjectMapper(YAMLFactory()).apply {
                registerKotlinModule()
            }.readValue(diagramFile, Diagram::class.java)
        } catch (e: Exception) {
            Diagram()
        }
    }

    fun saveDiagram(diagram: Diagram) {
        validateDiagram(diagram)
        val validConnections = diagram.connections.filter { conn ->
            diagram.nodes.any { it.id == conn.sourceId } && diagram.nodes.any { it.id == conn.targetId }
        }

        val validDiagram = diagram.copy(connections = validConnections)
        val mapper = ObjectMapper(YAMLFactory()).apply {
            registerKotlinModule()
        }
        mapper.writeValue(diagramFile, validDiagram)
        lastSavedHash = getContentHash(mapper.writeValueAsString(validDiagram))
    }

    private fun validateDiagram(diagram: Diagram) {
        diagram.nodes.forEach { node ->
            if (node.id.isBlank()) throw IllegalArgumentException("Node ID cannot be empty")
            if (node.type !in listOf("process", "decision", "terminal")) {
                throw IllegalArgumentException("Invalid node type: ${node.type}")
            }
            if (node.id == "@START" && node.dialog?.commands?.isEmpty() == true) {
                throw IllegalArgumentException("Start node must have at least one command")
            }
        }
    }

    private fun getContentHash(content: String): String {
        val digest = MessageDigest.getInstance("MD5")
        val hashBytes = digest.digest(content.toByteArray())
        return hashBytes.joinToString("") { "%02x".format(it) }
    }

    fun getDiagramName(): String {
        return diagramFile.name
    }
}