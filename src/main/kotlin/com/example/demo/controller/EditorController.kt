package com.example.demo.controller

import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping

@Controller
class EditorController {

    @GetMapping("/")
    fun index(): String {
        return "forward:/index.html"
    }
}