import http from "node:http"

console.log("Testing API...")
const req = http.get("http://localhost:3001/api/config", res => {
  let d = ""
  res.on("data", (c: string) => d += c)
  res.on("end", () => {
    console.log("Response:", d)
    process.exit(0)
  })
})
req.on("error", (e: Error) => {
  console.log("Error:", e.message)
  process.exit(1)
})
setTimeout(() => { console.log("Timeout"); process.exit(1) }, 8000)
