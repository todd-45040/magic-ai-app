
import React, { useState } from "react";

interface PropConcept {
  propName: string
  conceptSummary: string
  performanceUse: string
  constructionIdea: string
  materials: string[]
  estimatedCost: string
  transportNotes: string
  resetSpeed: string
  safetyNotes: string[]
  angleNotes: string[]
}

export default function PropGenerator() {

  const [loading,setLoading] = useState(false)
  const [result,setResult] = useState<PropConcept | null>(null)

  const [inputs,setInputs] = useState({
    propType:"",
    materials:"",
    skillLevel:"",
    audience:"",
    venue:"",
    budget:"",
    transport:"",
    reset:""
  })

  async function generate(){

    setLoading(true)

    try{

      const prompt = `
Design a magic performance prop.

Return JSON ONLY.

{
  "propName":"",
  "conceptSummary":"",
  "performanceUse":"",
  "constructionIdea":"",
  "materials":[],
  "estimatedCost":"",
  "transportNotes":"",
  "resetSpeed":"",
  "safetyNotes":[],
  "angleNotes":[]
}

Inputs:
Prop Type: ${inputs.propType}
Materials: ${inputs.materials}
Skill Level: ${inputs.skillLevel}
Audience: ${inputs.audience}
Venue: ${inputs.venue}
Budget: ${inputs.budget}
Transport: ${inputs.transport}
Reset: ${inputs.reset}
`

      const r = await fetch("/api/generate",{
        method:"POST",
        headers:{ "Content-Type":"application/json"},
        body:JSON.stringify({prompt})
      })

      const text = await r.text()

      const json = JSON.parse(text)

      setResult(json)

    }catch(e){
      console.error(e)
      alert("Generation failed")
    }

    setLoading(false)

  }

  return (

<div className="w-full h-full p-6">

<h1 className="text-2xl font-bold mb-4">Prop Generator</h1>

<div className="grid grid-cols-2 gap-6">

{/* LEFT PANEL */}

<div className="space-y-3">

<input placeholder="Prop Type"
value={inputs.propType}
onChange={e=>setInputs({...inputs,propType:e.target.value})}
className="w-full border p-2 rounded"/>

<input placeholder="Materials"
value={inputs.materials}
onChange={e=>setInputs({...inputs,materials:e.target.value})}
className="w-full border p-2 rounded"/>

<input placeholder="Skill Level"
value={inputs.skillLevel}
onChange={e=>setInputs({...inputs,skillLevel:e.target.value})}
className="w-full border p-2 rounded"/>

<input placeholder="Audience Type"
value={inputs.audience}
onChange={e=>setInputs({...inputs,audience:e.target.value})}
className="w-full border p-2 rounded"/>

<input placeholder="Venue"
value={inputs.venue}
onChange={e=>setInputs({...inputs,venue:e.target.value})}
className="w-full border p-2 rounded"/>

<input placeholder="Budget"
value={inputs.budget}
onChange={e=>setInputs({...inputs,budget:e.target.value})}
className="w-full border p-2 rounded"/>

<input placeholder="Transport"
value={inputs.transport}
onChange={e=>setInputs({...inputs,transport:e.target.value})}
className="w-full border p-2 rounded"/>

<input placeholder="Reset Speed"
value={inputs.reset}
onChange={e=>setInputs({...inputs,reset:e.target.value})}
className="w-full border p-2 rounded"/>

<button
onClick={generate}
className="bg-purple-600 text-white px-4 py-2 rounded w-full"
>

{loading ? "Generating..." : "Generate Prop"}

</button>

</div>

{/* RIGHT PANEL */}

<div className="border rounded p-4 bg-black/20">

{!result && <div className="opacity-60">Generated prop concept will appear here.</div>}

{result && (

<div className="space-y-3">

<h2 className="text-xl font-semibold">{result.propName}</h2>

<p>{result.conceptSummary}</p>

<div>
<b>Performance Use</b>
<p>{result.performanceUse}</p>
</div>

<div>
<b>Construction Plan</b>
<p>{result.constructionIdea}</p>
</div>

<div>
<b>Materials</b>
<ul>
{result.materials.map((m,i)=><li key={i}>{m}</li>)}
</ul>
</div>

<div>
<b>Cost Estimate</b>
<p>{result.estimatedCost}</p>
</div>

<div>
<b>Transport</b>
<p>{result.transportNotes}</p>
</div>

<div>
<b>Reset Speed</b>
<p>{result.resetSpeed}</p>
</div>

<div>
<b>Safety Notes</b>
<ul>
{result.safetyNotes.map((m,i)=><li key={i}>{m}</li>)}
</ul>
</div>

<div>
<b>Angle Notes</b>
<ul>
{result.angleNotes.map((m,i)=><li key={i}>{m}</li>)}
</ul>
</div>

</div>

)}

</div>

</div>

</div>

  )
}
