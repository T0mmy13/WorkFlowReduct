package com.example.demo.controller

import com.example.demo.service.DiagramService
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/diagram")
class DiagramController(private val diagramService: DiagramService) {

    @GetMapping
    fun getDiagram(): DiagramService.Diagram {
        return diagramService.loadDiagram()
    }

    @GetMapping("/name")
    fun getDiagramName(): Map<String, String> {
        return mapOf("name" to diagramService.getDiagramName())
    }

    @PostMapping
    fun saveDiagram(@RequestBody diagram: DiagramService.Diagram): Map<String, String> {
        diagramService.saveDiagram(diagram)
        return mapOf(
            "status" to "success",
            "hash" to diagramService.lastSavedHash
        )
    }
}