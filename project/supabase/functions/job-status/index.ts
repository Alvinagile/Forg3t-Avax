import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { handleError, HttpError } from "../_shared/errors.ts";
import { requireUser } from "../_shared/supabase.ts";
import { requireProjectMembership } from "../_shared/rbac.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const { user, serviceClient } = await requireUser(req);
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");

    if (!jobId) {
      throw new HttpError(400, "jobId is required");
    }

    const { data: job, error } = await serviceClient
      .from("unlearning_requests")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "Failed to load job status");
    }

    if (!job) {
      throw new HttpError(404, "Job not found");
    }

    await requireProjectMembership(serviceClient, job.project_id, user.id);

    if (req.method === "GET") {
      return jsonResponse({
        job,
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { data: updatedJob, error: updateError } = await serviceClient
        .from("unlearning_requests")
        .update({
          status: body.status ?? job.status,
          error_message: body.errorMessage ?? job.error_message,
          completed_at: body.status === "completed" ? new Date().toISOString() : job.completed_at,
        })
        .eq("id", jobId)
        .select("*")
        .single();

      if (updateError || !updatedJob) {
        throw new HttpError(500, "Failed to update job status");
      }

      return jsonResponse({
        job: updatedJob,
      });
    }

    throw new HttpError(405, "Method not allowed");
  } catch (error) {
    return handleError(error);
  }
});
