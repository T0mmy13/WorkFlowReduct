package com.example.demo.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.io.File
import javax.annotation.PostConstruct
import java.security.MessageDigest
import com.fasterxml.jackson.annotation.JsonInclude
import org.slf4j.LoggerFactory

@Service
class DiagramService(
    @Value("\${diagram.file.path:classpath:scheme/}") private val diagramPath: String
) {
    private val logger = LoggerFactory.getLogger(DiagramService::class.java)
    private val mapper = ObjectMapper(YAMLFactory()).apply {
        registerKotlinModule()
        setSerializationInclusion(JsonInclude.Include.NON_NULL)
    }

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
        val basePath = if (diagramPath.startsWith("classpath:")) {
            "src/main/resources/" + diagramPath.removePrefix("classpath:")
        } else {
            diagramPath
        }

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
                            answer = listOf("Запиши", "Запись", "Напомни", "Зарегистрируй", "Назначь", "Оформи"),
                            node_to = ""
                        )
                    )
                )
            )

            val stopNode = Node(
                id = "@END",
                type = "terminal",
                text = "Конец",
                x = 500,
                y = 100,
                width = 80,
                height = 80,
                success_ending = false
            )

            saveDiagram(Diagram(
                nodes = listOf(startNode, stopNode),
                connections = emptyList()
            ))
        }
    }

    fun loadDiagram(): Diagram {
        return try {
            logger.info("Loading diagram from: ${diagramFile.absolutePath}")
            if (!diagramFile.exists() || diagramFile.length() == 0L) {
                logger.warn("Diagram file is empty or does not exist")
                return Diagram()
            }
            val diagram = mapper.readValue(diagramFile, Diagram::class.java)
            logger.info("Loaded diagram with ${diagram.nodes.size} nodes and ${diagram.connections.size} connections")
            diagram
        } catch (e: Exception) {
            logger.error("Error loading diagram: ${e.message}")
            Diagram()
        }
    }

    fun saveDiagram(diagram: Diagram) {
        validateDiagram(diagram)
        logger.info("Saving diagram with ${diagram.nodes.size} nodes and ${diagram.connections.size} connections")
        val validConnections = diagram.connections.filter { conn ->
            diagram.nodes.any { it.id == conn.sourceId } && diagram.nodes.any { it.id == conn.targetId }
        }

        val validDiagram = diagram.copy(connections = validConnections)
        mapper.writeValue(diagramFile, validDiagram)
        lastSavedHash = getContentHash(mapper.writeValueAsString(validDiagram))
        logger.info("Diagram saved successfully. Hash: $lastSavedHash")
    }

    private fun validateDiagram(diagram: Diagram) {
        diagram.nodes.forEach { node ->
            if (node.id.isBlank()) throw IllegalArgumentException("Node ID cannot be empty")
            if (node.type !in listOf("process", "decision", "terminal")) {
                throw IllegalArgumentException("Invalid node type: ${node.type}")
            }
            if (node.type == "terminal" && node.id == "@begin" && node.dialog?.commands.isNullOrEmpty()) {
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