const text = "#### ?? Notes\n\n> my note"; const m = text.match(/####?\s*.*?Notes([\s\S]*)/i); console.log(m ? m[1].trim() : "FAIL")
