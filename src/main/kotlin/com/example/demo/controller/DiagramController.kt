package com.example.demo.controller

import com.example.demo.service.DiagramService
import org.slf4j.LoggerFactory
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/diagram")
class DiagramController(private val diagramService: DiagramService) {
    private val logger = LoggerFactory.getLogger(DiagramController::class.java)

    @GetMapping
    fun getDiagram(): DiagramService.Diagram {
        logger.info("Fetching diagram data")
        return diagramService.loadDiagram()
    }

    @GetMapping("/name")
    fun getDiagramName(): Map<String, String> {
        return mapOf("name" to diagramService.getDiagramName())
    }

    @PostMapping
    fun saveDiagram(@RequestBody diagram: DiagramService.Diagram): Map<String, String> {
        logger.info("Received save request for diagram")
        diagramService.saveDiagram(diagram)
        return mapOf(
            "status" to "success",
            "hash" to diagramService.lastSavedHash
        )
    }
}