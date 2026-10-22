CREATE TABLE "assignment_student" (
	"assignment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "assignment_student_assignment_id_user_id_pk" PRIMARY KEY("assignment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feedback_snippet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"question_id" uuid,
	"text" text NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_neutralization" (
	"assignment_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"previous" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_neutralization_assignment_id_question_id_pk" PRIMARY KEY("assignment_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "student_accommodation" (
	"user_id" text PRIMARY KEY NOT NULL,
	"extra_time_percent" integer DEFAULT 0 NOT NULL,
	"allow_paste" boolean DEFAULT false NOT NULL,
	"ignore_focus_events" boolean DEFAULT false NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_accommodation_extra_time_range" CHECK ("student_accommodation"."extra_time_percent" >= 0 and "student_accommodation"."extra_time_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_role" text NOT NULL,
	"actor_name" text,
	"impersonator_id" text,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"subject_user_id" text,
	"subject_label" text,
	"details" jsonb,
	"ip_prefix" text
);
--> statement-breakpoint
CREATE TABLE "retention_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"assignment_id" uuid,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"until" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_hold_target" CHECK ("retention_hold"."user_id" is not null or "retention_hold"."assignment_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "retention_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"triggered_by_id" text,
	"dry_run" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"report" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "user_activity" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_sign_in_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer" ADD COLUMN "hints_used" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "answer" ADD COLUMN "rubric_checked" jsonb;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "retake_of_id" uuid;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "accommodation_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "source_question_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "password_change_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_student" ADD CONSTRAINT "assignment_student_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_student" ADD CONSTRAINT "assignment_student_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_snippet" ADD CONSTRAINT "feedback_snippet_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_snippet" ADD CONSTRAINT "feedback_snippet_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_neutralization" ADD CONSTRAINT "question_neutralization_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_neutralization" ADD CONSTRAINT "question_neutralization_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_neutralization" ADD CONSTRAINT "question_neutralization_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_accommodation" ADD CONSTRAINT "student_accommodation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_accommodation" ADD CONSTRAINT "student_accommodation_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_hold" ADD CONSTRAINT "retention_hold_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_hold" ADD CONSTRAINT "retention_hold_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_hold" ADD CONSTRAINT "retention_hold_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_run" ADD CONSTRAINT "retention_run_triggered_by_id_user_id_fk" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_student_user_idx" ON "assignment_student" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_snippet_owner_idx" ON "feedback_snippet" USING btree ("owner_id","question_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_subject_user_idx" ON "audit_log" USING btree ("subject_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "retention_hold_user_idx" ON "retention_hold" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "retention_hold_assignment_idx" ON "retention_hold" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "retention_run_started_idx" ON "retention_run" USING btree ("started_at");--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_retake_of_id_assignment_id_fk" FOREIGN KEY ("retake_of_id") REFERENCES "public"."assignment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_tags_idx" ON "question" USING gin ("tags");