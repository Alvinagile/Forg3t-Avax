import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

// Simple in-memory job storage (in production, use a database)
const jobStore = new Map<string, any>()

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    const url = new URL(req.url)
    const jobId = url.searchParams.get('jobId')
    
    if (!jobId) {
      throw new Error('Job ID is required')
    }

    if (req.method === 'GET') {
      // Get job status
      const jobData = jobStore.get(jobId)
      
      if (!jobData) {
        return new Response(
          JSON.stringify({
            error: 'Job not found',
            jobId
          }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            }
          }
        )
      }

      return new Response(
        JSON.stringify(jobData),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          }
        }
      )
      
    } else if (req.method === 'POST') {
      // Update job status
      const updateData = await req.json()
      
      jobStore.set(jobId, {
        jobId,
        ...updateData,
        lastUpdated: new Date().toISOString()
      })
      
      console.log(`[JOB] Updated ${jobId}: ${updateData.status} (${updateData.progress}%)`)
      
      return new Response(
        JSON.stringify({ success: true }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          }
        }
      )
    }

    throw new Error('Method not allowed')

  } catch (error) {
    console.error('[JOB] Status error:', error instanceof Error ? error.message : 'Unknown error')
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        }
      }
    )
  }
})