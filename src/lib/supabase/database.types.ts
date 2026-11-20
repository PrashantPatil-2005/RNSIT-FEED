export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      batches: {
        Row: {
          grad_year: number;
          id: number;
        };
        ComputedFields: never;
        Insert: {
          grad_year: number;
          id?: never;
        };
        Update: {
          grad_year?: number;
          id?: never;
        };
        Relationships: [];
      };
      comment_reports: {
        Row: {
          comment_id: string;
          created_at: string;
          details: string | null;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["report_status"];
        };
        ComputedFields: never;
        Insert: {
          comment_id: string;
          created_at?: string;
          details?: string | null;
          id?: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          details?: string | null;
          id?: string;
          reason?: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "moderation_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "my_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "public_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          experience_id: string;
          id: string;
          removed_at: string | null;
          status: Database["public"]["Enums"]["comment_status"];
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          experience_id: string;
          id?: string;
          removed_at?: string | null;
          status?: Database["public"]["Enums"]["comment_status"];
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          experience_id?: string;
          id?: string;
          removed_at?: string | null;
          status?: Database["public"]["Enums"]["comment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      company_aliases: {
        Row: {
          alias: string;
          company_id: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          alias: string;
          company_id: string;
          id?: string;
        };
        Update: {
          alias?: string;
          company_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_aliases_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_aliases_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "company_stats";
            referencedColumns: ["company_id"];
          },
        ];
      };
      departments: {
        Row: {
          active: boolean;
          code: string;
          id: number;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          code: string;
          id?: never;
          name: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          id?: never;
          name?: string;
        };
        Relationships: [];
      };
      experience_eligible_departments: {
        Row: {
          department_id: number;
          experience_id: string;
        };
        ComputedFields: never;
        Insert: {
          department_id: number;
          experience_id: string;
        };
        Update: {
          department_id?: number;
          experience_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "experience_eligible_departments_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_eligible_departments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_eligible_departments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_eligible_departments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_eligible_departments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "experience_eligible_departments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      experience_resources: {
        Row: {
          experience_id: string;
          id: string;
          label: string | null;
          position: number;
          url: string;
        };
        ComputedFields: never;
        Insert: {
          experience_id: string;
          id?: string;
          label?: string | null;
          position: number;
          url: string;
        };
        Update: {
          experience_id?: string;
          id?: string;
          label?: string | null;
          position?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "experience_resources_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_resources_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_resources_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_resources_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "experience_resources_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      experience_votes: {
        Row: {
          created_at: string;
          experience_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          experience_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          experience_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "experience_votes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_votes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_votes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_votes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "experience_votes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_votes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      experiences: {
        Row: {
          approved_at: string | null;
          backlogs_allowed: number | null;
          batch_id: number;
          campus_type: Database["public"]["Enums"]["campus_type"] | null;
          company_id: string | null;
          created_at: string;
          department_id: number;
          id: string;
          is_anonymous: boolean | null;
          min_cgpa: number | null;
          moderation_note: string | null;
          opportunity_type: Database["public"]["Enums"]["opportunity_type"] | null;
          prep_tips: string | null;
          recruitment_year: number | null;
          rejected_at: string | null;
          result: Database["public"]["Enums"]["result_type"] | null;
          role_title: string | null;
          row_version: number;
          search_doc: unknown;
          status: Database["public"]["Enums"]["exp_status"];
          submitted_at: string | null;
          updated_at: string;
          withdrawn_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          backlogs_allowed?: number | null;
          batch_id: number;
          campus_type?: Database["public"]["Enums"]["campus_type"] | null;
          company_id?: string | null;
          created_at?: string;
          department_id: number;
          id?: string;
          is_anonymous?: boolean | null;
          min_cgpa?: number | null;
          moderation_note?: string | null;
          opportunity_type?: Database["public"]["Enums"]["opportunity_type"] | null;
          prep_tips?: string | null;
          recruitment_year?: number | null;
          rejected_at?: string | null;
          result?: Database["public"]["Enums"]["result_type"] | null;
          role_title?: string | null;
          row_version?: number;
          search_doc?: unknown;
          status?: Database["public"]["Enums"]["exp_status"];
          submitted_at?: string | null;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Update: {
          approved_at?: string | null;
          backlogs_allowed?: number | null;
          batch_id?: number;
          campus_type?: Database["public"]["Enums"]["campus_type"] | null;
          company_id?: string | null;
          created_at?: string;
          department_id?: number;
          id?: string;
          is_anonymous?: boolean | null;
          min_cgpa?: number | null;
          moderation_note?: string | null;
          opportunity_type?: Database["public"]["Enums"]["opportunity_type"] | null;
          prep_tips?: string | null;
          recruitment_year?: number | null;
          rejected_at?: string | null;
          result?: Database["public"]["Enums"]["result_type"] | null;
          role_title?: string | null;
          row_version?: number;
          search_doc?: unknown;
          status?: Database["public"]["Enums"]["exp_status"];
          submitted_at?: string | null;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "experiences_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experiences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experiences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "company_stats";
            referencedColumns: ["company_id"];
          },
          {
            foreignKeyName: "experiences_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_actions: {
        Row: {
          action: Database["public"]["Enums"]["mod_action"];
          actor_id: string | null;
          actor_role: string;
          comment_id: string | null;
          comment_report_id: string | null;
          created_at: string;
          experience_id: string | null;
          id: number;
          reason_code: Database["public"]["Enums"]["reason_code"] | null;
          report_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: Database["public"]["Enums"]["mod_action"];
          actor_id?: string | null;
          actor_role: string;
          comment_id?: string | null;
          comment_report_id?: string | null;
          created_at?: string;
          experience_id?: string | null;
          id?: never;
          reason_code?: Database["public"]["Enums"]["reason_code"] | null;
          report_id?: string | null;
        };
        Update: {
          action?: Database["public"]["Enums"]["mod_action"];
          actor_id?: string | null;
          actor_role?: string;
          comment_id?: string | null;
          comment_report_id?: string | null;
          created_at?: string;
          experience_id?: string | null;
          id?: never;
          reason_code?: Database["public"]["Enums"]["reason_code"] | null;
          report_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_actions_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "moderation_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "my_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "public_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_comment_report_id_fkey";
            columns: ["comment_report_id"];
            isOneToOne: false;
            referencedRelation: "comment_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_comment_report_id_fkey";
            columns: ["comment_report_id"];
            isOneToOne: false;
            referencedRelation: "moderation_comment_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_comment_report_id_fkey";
            columns: ["comment_report_id"];
            isOneToOne: false;
            referencedRelation: "my_comment_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "moderation_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "my_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          batch_id: number | null;
          created_at: string;
          deletion_requested_at: string | null;
          department_id: number | null;
          domain_verified: boolean;
          full_name: string;
          id: string;
          onboarded_at: string | null;
          role: Database["public"]["Enums"]["user_role"];
        };
        ComputedFields: never;
        Insert: {
          batch_id?: number | null;
          created_at?: string;
          deletion_requested_at?: string | null;
          department_id?: number | null;
          domain_verified?: boolean;
          full_name: string;
          id: string;
          onboarded_at?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Update: {
          batch_id?: number | null;
          created_at?: string;
          deletion_requested_at?: string | null;
          department_id?: number | null;
          domain_verified?: boolean;
          full_name?: string;
          id?: string;
          onboarded_at?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Relationships: [
          {
            foreignKeyName: "profiles_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      question_topics: {
        Row: {
          question_id: string;
          topic_id: number;
        };
        ComputedFields: never;
        Insert: {
          question_id: string;
          topic_id: number;
        };
        Update: {
          question_id?: string;
          topic_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "question_topics_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "public_questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_topics_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_topics_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          body: string;
          id: string;
          position: number;
          round_id: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          id?: string;
          position: number;
          round_id: string;
        };
        Update: {
          body?: string;
          id?: string;
          position?: number;
          round_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "public_rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          experience_id: string;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["report_status"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          details?: string | null;
          experience_id: string;
          id?: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Update: {
          created_at?: string;
          details?: string | null;
          experience_id?: string;
          id?: string;
          reason?: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Relationships: [
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      round_topics: {
        Row: {
          round_id: string;
          topic_id: number;
        };
        ComputedFields: never;
        Insert: {
          round_id: string;
          topic_id: number;
        };
        Update: {
          round_id?: string;
          topic_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "round_topics_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "public_rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "round_topics_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "round_topics_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      rounds: {
        Row: {
          difficulty: number | null;
          duration_min: number | null;
          experience_id: string;
          id: string;
          notes: string | null;
          platform: string | null;
          position: number;
          round_type: Database["public"]["Enums"]["round_type"];
        };
        ComputedFields: never;
        Insert: {
          difficulty?: number | null;
          duration_min?: number | null;
          experience_id: string;
          id?: string;
          notes?: string | null;
          platform?: string | null;
          position: number;
          round_type: Database["public"]["Enums"]["round_type"];
        };
        Update: {
          difficulty?: number | null;
          duration_min?: number | null;
          experience_id?: string;
          id?: string;
          notes?: string | null;
          platform?: string | null;
          position?: number;
          round_type?: Database["public"]["Enums"]["round_type"];
        };
        Relationships: [
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      topics: {
        Row: {
          id: number;
          name: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          id?: never;
          name: string;
          slug: string;
        };
        Update: {
          id?: never;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      company_stats: {
        Row: {
          avg_difficulty: number | null;
          company_id: string;
          name: string;
          post_count: number | null;
          result_counts: Json | null;
          round_type_counts: Json | null;
          slug: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      moderation_comment_reports: {
        Row: {
          comment_id: string;
          created_at: string;
          details: string | null;
          experience_id: string;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          status: Database["public"]["Enums"]["report_status"];
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "moderation_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "my_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "public_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_comments: {
        Row: {
          author_name: string | null;
          body: string;
          by_post_author: boolean | null;
          created_at: string;
          experience_id: string;
          id: string;
          open_reports: number | null;
          removed_at: string | null;
          status: Database["public"]["Enums"]["comment_status"];
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_experiences: {
        Row: {
          author_name: string | null;
          batch_year: number;
          campus_type: Database["public"]["Enums"]["campus_type"] | null;
          company_name: string;
          decided_at: string | null;
          department_code: string;
          id: string;
          is_anonymous: boolean | null;
          moderation_note: string | null;
          opportunity_type: Database["public"]["Enums"]["opportunity_type"] | null;
          recruitment_year: number | null;
          result: Database["public"]["Enums"]["result_type"] | null;
          role_title: string | null;
          row_version: number;
          status: Database["public"]["Enums"]["exp_status"];
          submitted_at: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      moderation_history: {
        Row: {
          action: Database["public"]["Enums"]["mod_action"];
          actor_name: string | null;
          actor_role: string;
          created_at: string;
          experience_id: string | null;
          id: number;
          reason_code: Database["public"]["Enums"]["reason_code"] | null;
          report_id: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "moderation_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "my_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_reports: {
        Row: {
          created_at: string;
          details: string | null;
          experience_id: string;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          status: Database["public"]["Enums"]["report_status"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          details?: string | null;
          experience_id?: string | null;
          id?: string | null;
          reason?: Database["public"]["Enums"]["report_reason"] | null;
          status?: Database["public"]["Enums"]["report_status"] | null;
        };
        Update: {
          created_at?: string | null;
          details?: string | null;
          experience_id?: string | null;
          id?: string | null;
          reason?: Database["public"]["Enums"]["report_reason"] | null;
          status?: Database["public"]["Enums"]["report_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      my_comment_reports: {
        Row: {
          comment_id: string;
          created_at: string;
          details: string | null;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          status: Database["public"]["Enums"]["report_status"];
        };
        ComputedFields: never;
        Insert: {
          comment_id?: string | null;
          created_at?: string | null;
          details?: string | null;
          id?: string | null;
          reason?: Database["public"]["Enums"]["report_reason"] | null;
          status?: Database["public"]["Enums"]["report_status"] | null;
        };
        Update: {
          comment_id?: string | null;
          created_at?: string | null;
          details?: string | null;
          id?: string | null;
          reason?: Database["public"]["Enums"]["report_reason"] | null;
          status?: Database["public"]["Enums"]["report_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "moderation_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "my_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "public_comments";
            referencedColumns: ["id"];
          },
        ];
      };
      my_comments: {
        Row: {
          body: string;
          created_at: string;
          experience_id: string;
          id: string;
          removed_at: string | null;
          status: Database["public"]["Enums"]["comment_status"];
        };
        ComputedFields: never;
        Insert: {
          body?: string | null;
          created_at?: string | null;
          experience_id?: string | null;
          id?: string | null;
          removed_at?: string | null;
          status?: Database["public"]["Enums"]["comment_status"] | null;
        };
        Update: {
          body?: string | null;
          created_at?: string | null;
          experience_id?: string | null;
          id?: string | null;
          removed_at?: string | null;
          status?: Database["public"]["Enums"]["comment_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      my_experiences: {
        Row: {
          approved_at: string | null;
          campus_type: Database["public"]["Enums"]["campus_type"] | null;
          company_id: string | null;
          created_at: string;
          id: string;
          is_anonymous: boolean | null;
          moderation_note: string | null;
          opportunity_type: Database["public"]["Enums"]["opportunity_type"] | null;
          recruitment_year: number | null;
          result: Database["public"]["Enums"]["result_type"] | null;
          role_title: string | null;
          row_version: number;
          status: Database["public"]["Enums"]["exp_status"];
          submitted_at: string | null;
          updated_at: string;
          withdrawn_at: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "experiences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experiences_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "company_stats";
            referencedColumns: ["company_id"];
          },
        ];
      };
      my_moderation_feedback: {
        Row: {
          action: Database["public"]["Enums"]["mod_action"];
          created_at: string;
          experience_id: string | null;
          id: number;
          reason_code: Database["public"]["Enums"]["reason_code"] | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "moderation_actions_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      my_notices: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["notice_kind"];
          read_at: string | null;
          ref_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          id?: string | null;
          kind?: Database["public"]["Enums"]["notice_kind"] | null;
          read_at?: string | null;
          ref_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string | null;
          kind?: Database["public"]["Enums"]["notice_kind"] | null;
          read_at?: string | null;
          ref_id?: string | null;
        };
        Relationships: [];
      };
      my_reports: {
        Row: {
          created_at: string;
          details: string | null;
          experience_id: string;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          status: Database["public"]["Enums"]["report_status"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          details?: string | null;
          experience_id?: string | null;
          id?: string | null;
          reason?: Database["public"]["Enums"]["report_reason"] | null;
          status?: Database["public"]["Enums"]["report_status"] | null;
        };
        Update: {
          created_at?: string | null;
          details?: string | null;
          experience_id?: string | null;
          id?: string | null;
          reason?: Database["public"]["Enums"]["report_reason"] | null;
          status?: Database["public"]["Enums"]["report_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "reports_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      my_votes: {
        Row: {
          created_at: string;
          experience_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          experience_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          experience_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "experience_votes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_votes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_votes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_votes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "experience_votes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      public_comments: {
        Row: {
          author_name: string | null;
          body: string;
          by_post_author: boolean | null;
          experience_id: string;
          id: string;
          is_mine: boolean | null;
          posted_on: string | null;
          seq: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "comments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      public_eligible_departments: {
        Row: {
          department_code: string;
          experience_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "experience_eligible_departments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_eligible_departments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_eligible_departments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_eligible_departments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "experience_eligible_departments_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      public_engagement: {
        Row: {
          comment_count: number | null;
          experience_id: string;
          helpful_count: number | null;
        };
        ComputedFields: never;
        Insert: {
          comment_count?: never;
          experience_id?: string | null;
          helpful_count?: never;
        };
        Update: {
          comment_count?: never;
          experience_id?: string | null;
          helpful_count?: never;
        };
        Relationships: [];
      };
      public_experiences: {
        Row: {
          author_name: string | null;
          backlogs_allowed: number | null;
          batch_year: number;
          campus_type: Database["public"]["Enums"]["campus_type"] | null;
          company_name: string;
          company_slug: string;
          department_code: string;
          department_name: string;
          id: string;
          is_anonymous: boolean | null;
          min_cgpa: number | null;
          opportunity_type: Database["public"]["Enums"]["opportunity_type"] | null;
          prep_tips: string | null;
          published_on: string | null;
          recruitment_year: number | null;
          result: Database["public"]["Enums"]["result_type"] | null;
          role_title: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      public_questions: {
        Row: {
          body: string;
          experience_id: string;
          id: string;
          position: number;
          round_id: string;
          topics: string[] | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "questions_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "public_rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      public_resources: {
        Row: {
          experience_id: string;
          label: string | null;
          position: number;
          url: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "experience_resources_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_resources_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_resources_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_resources_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "experience_resources_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      public_rounds: {
        Row: {
          difficulty: number | null;
          duration_min: number | null;
          experience_id: string;
          id: string;
          notes: string | null;
          platform: string | null;
          position: number;
          round_type: Database["public"]["Enums"]["round_type"];
          topics: string[] | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "moderation_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "my_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_engagement";
            referencedColumns: ["experience_id"];
          },
          {
            foreignKeyName: "rounds_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "public_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      add_comment: { Args: { p_body: string; p_experience: string }; Returns: string };
      admin_add_company_alias: {
        Args: { p_alias: string; p_company: string; p_reason: string };
        Returns: string;
      };
      admin_assign_moderator_department: {
        Args: { p_department: number; p_reason: string; p_user: string };
        Returns: undefined;
      };
      admin_correct_name: {
        Args: { p_name: string; p_reason: string; p_user: string };
        Returns: undefined;
      };
      admin_create_company: {
        Args: { p_name: string; p_reason: string; p_slug: string };
        Returns: string;
      };
      admin_create_topic: {
        Args: { p_name: string; p_reason: string; p_slug: string };
        Returns: number;
      };
      admin_get_usn: { Args: { p_reason: string; p_user: string }; Returns: string };
      admin_invite_alumnus: { Args: { p_email: string; p_reason: string }; Returns: string };
      admin_list_alumni_invites: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          email_masked: string;
          expires_at: string;
          id: string;
          revoked_at: string;
          status: string;
          used_at: string;
        }[];
      };
      admin_list_audit: {
        Args: { p_limit?: number; p_reason: string };
        Returns: {
          action: Database["public"]["Enums"]["admin_action"];
          actor_id: string;
          case_id: string;
          created_at: string;
          evidence_ref: string;
          experience_id: string;
          id: number;
          reason: string;
          target_user_id: string;
          verification_method: string;
        }[];
      };
      admin_list_settings: {
        Args: Record<PropertyKey, never>;
        Returns: {
          key: string;
          value: string;
        }[];
      };
      admin_moderator_activity: {
        Args: { p_days?: number };
        Returns: {
          decisions: number;
          full_name: string;
          last_decision_at: string;
          role: Database["public"]["Enums"]["user_role"];
          user_id: string;
        }[];
      };
      admin_moderator_coverage: {
        Args: Record<PropertyKey, never>;
        Returns: {
          code: string;
          department_id: number;
          moderator_count: number;
          moderators: Json;
          name: string;
        }[];
      };
      admin_owner_id: { Args: Record<PropertyKey, never>; Returns: string };
      admin_rename_topic: {
        Args: { p_name: string; p_reason: string; p_topic: number };
        Returns: undefined;
      };
      admin_reveal_author: { Args: { p_experience: string; p_reason: string }; Returns: Json };
      admin_revoke_alumni_invite: { Args: { p_id: string; p_reason: string }; Returns: undefined };
      admin_set_setting: {
        Args: { p_key: string; p_reason: string; p_value: string };
        Returns: undefined;
      };
      admin_set_user_role: {
        Args: {
          p_reason: string;
          p_role: Database["public"]["Enums"]["user_role"];
          p_user: string;
        };
        Returns: undefined;
      };
      admin_unassign_moderator_department: {
        Args: { p_department: number; p_reason: string; p_user: string };
        Returns: undefined;
      };
      admin_user_role_history: {
        Args: { p_user: string };
        Returns: {
          changed_by_name: string;
          created_at: string;
          new_role: Database["public"]["Enums"]["user_role"];
          old_role: Database["public"]["Enums"]["user_role"];
          self_service: boolean;
        }[];
      };
      admin_usn_case_approve: {
        Args: {
          p_case: string;
          p_evidence_ref: string;
          p_method: string;
          p_no_conflict_attested: boolean;
          p_reason: string;
        };
        Returns: undefined;
      };
      admin_usn_case_deny: { Args: { p_case: string; p_reason: string }; Returns: undefined };
      admin_usn_case_execute: { Args: { p_case: string; p_reason: string }; Returns: undefined };
      admin_usn_case_notify: { Args: { p_case: string; p_reason: string }; Returns: undefined };
      admin_usn_case_take: {
        Args: { p_case: string; p_no_conflict_attested: boolean; p_reason: string };
        Returns: undefined;
      };
      cancel_submission: { Args: { p_id: string }; Returns: undefined };
      complete_onboarding: {
        Args: { p_batch_id: number; p_department_id: number; p_usn: string };
        Returns: string;
      };
      delete_account_data: { Args: { p_user: string }; Returns: undefined };
      delete_draft: { Args: { p_id: string }; Returns: undefined };
      delete_my_comment: { Args: { p_id: string }; Returns: undefined };
      get_my_experience: { Args: { p_id: string }; Returns: Json };
      get_my_usn: { Args: Record<PropertyKey, never>; Returns: string };
      hook_before_user_created: { Args: { event: Json }; Returns: Json };
      mark_notice_read: { Args: { p_id: string }; Returns: undefined };
      moderate_comment: {
        Args: {
          p_action: string;
          p_id: string;
          p_reason?: Database["public"]["Enums"]["reason_code"];
        };
        Returns: undefined;
      };
      moderate_experience: {
        Args: {
          p_action: string;
          p_expected_version?: number;
          p_id: string;
          p_note?: string;
          p_reason?: Database["public"]["Enums"]["reason_code"];
        };
        Returns: undefined;
      };
      moderation_experience_detail: { Args: { p_id: string }; Returns: Json };
      moderator_step_down: {
        Args: { p_reason: string };
        Returns: Database["public"]["Enums"]["user_role"];
      };
      my_moderation_activity: {
        Args: { p_days?: number };
        Returns: {
          decisions: number;
          last_decision_at: string;
        }[];
      };
      my_moderator_departments: {
        Args: Record<PropertyKey, never>;
        Returns: {
          code: string;
          department_id: number;
          name: string;
        }[];
      };
      object_to_usn_release: { Args: { p_case: string }; Returns: undefined };
      purge_deletion_ledger: { Args: { p_days?: number }; Returns: number };
      purge_expired_alumni_invites: { Args: Record<PropertyKey, never>; Returns: number };
      purge_expired_drafts: { Args: { p_days?: number }; Returns: number };
      purge_rejected_experiences: { Args: { p_days?: number }; Returns: number };
      report_comment: {
        Args: {
          p_details?: string;
          p_id: string;
          p_reason: Database["public"]["Enums"]["report_reason"];
        };
        Returns: undefined;
      };
      report_experience: {
        Args: {
          p_details?: string;
          p_id: string;
          p_reason: Database["public"]["Enums"]["report_reason"];
        };
        Returns: undefined;
      };
      request_account_deletion: { Args: Record<PropertyKey, never>; Returns: undefined };
      request_usn_review: { Args: { p_usn: string }; Returns: Json };
      resolve_comment_report: {
        Args: {
          p_id: string;
          p_outcome: string;
          p_reason?: Database["public"]["Enums"]["reason_code"];
          p_remove?: boolean;
        };
        Returns: undefined;
      };
      resolve_report: {
        Args: {
          p_id: string;
          p_outcome: string;
          p_reason?: Database["public"]["Enums"]["reason_code"];
          p_remove?: boolean;
        };
        Returns: undefined;
      };
      save_draft: {
        Args: { p_expected_version: number; p_id: string; p_payload: Json };
        Returns: Json;
      };
      search_experiences: {
        Args: {
          p_batch_id?: number;
          p_company_id?: string;
          p_department_id?: number;
          p_limit?: number;
          p_offset?: number;
          p_opportunity?: Database["public"]["Enums"]["opportunity_type"];
          p_query?: string;
          p_result?: Database["public"]["Enums"]["result_type"];
          p_round_type?: Database["public"]["Enums"]["round_type"];
        };
        Returns: {
          author_name: string;
          batch_year: number;
          campus_type: Database["public"]["Enums"]["campus_type"];
          company_name: string;
          company_slug: string;
          department_code: string;
          id: string;
          is_anonymous: boolean;
          opportunity_type: Database["public"]["Enums"]["opportunity_type"];
          published_on: string;
          rank: number;
          recruitment_year: number;
          result: Database["public"]["Enums"]["result_type"];
          role_title: string;
        }[];
      };
      set_helpful_vote: { Args: { p_experience: string; p_helpful: boolean }; Returns: number };
      site_status: { Args: Record<PropertyKey, never>; Returns: Json };
      submit_experience: { Args: { p_id: string }; Returns: undefined };
      withdraw_experience: { Args: { p_id: string }; Returns: undefined };
    };
    Enums: {
      admin_action:
        | "bootstrap_admin"
        | "set_role"
        | "correct_name"
        | "reveal_author"
        | "view_usn"
        | "view_audit"
        | "manage_company"
        | "take_usn_case"
        | "notify_usn_holder"
        | "approve_usn_case"
        | "deny_usn_case"
        | "execute_usn_release"
        | "invite_alumnus"
        | "revoke_alumni_invite"
        | "assign_moderator_department"
        | "unassign_moderator_department"
        | "moderator_step_down"
        | "manage_topic"
        | "owner_auto_admin"
        | "change_setting";
      campus_type: "on_campus" | "off_campus";
      comment_status: "visible" | "removed";
      exp_status:
        "draft" | "pending" | "approved" | "rejected" | "returned" | "removed" | "withdrawn";
      mod_action:
        | "submit"
        | "resubmit"
        | "approve"
        | "reject"
        | "remove"
        | "restore"
        | "withdraw"
        | "resolve_report"
        | "dismiss_report"
        | "cancel_submission"
        | "remove_comment"
        | "restore_comment"
        | "resolve_comment_report"
        | "dismiss_comment_report"
        | "return";
      notice_kind: "usn_dispute_opened" | "usn_released";
      opportunity_type: "internship" | "full_time" | "both";
      reason_code: "nda" | "personal_info" | "defamation" | "low_quality" | "duplicate" | "other";
      report_reason: "nda" | "personal_info" | "defamation" | "spam" | "fake" | "other";
      report_status: "open" | "actioned" | "dismissed" | "moot";
      result_type: "selected" | "rejected" | "waitlisted";
      round_type: "oa" | "technical" | "hr" | "gd" | "managerial";
      user_role: "student" | "alumni" | "moderator" | "admin";
      usn_case_state:
        | "opened"
        | "under_review"
        | "notice_sent"
        | "contested"
        | "approved"
        | "denied"
        | "executed"
        | "closed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      admin_action: [
        "bootstrap_admin",
        "set_role",
        "correct_name",
        "reveal_author",
        "view_usn",
        "view_audit",
        "manage_company",
        "take_usn_case",
        "notify_usn_holder",
        "approve_usn_case",
        "deny_usn_case",
        "execute_usn_release",
        "invite_alumnus",
        "revoke_alumni_invite",
        "assign_moderator_department",
        "unassign_moderator_department",
        "moderator_step_down",
        "manage_topic",
        "owner_auto_admin",
        "change_setting",
      ],
      campus_type: ["on_campus", "off_campus"],
      comment_status: ["visible", "removed"],
      exp_status: ["draft", "pending", "approved", "rejected", "returned", "removed", "withdrawn"],
      mod_action: [
        "submit",
        "resubmit",
        "approve",
        "reject",
        "remove",
        "restore",
        "withdraw",
        "resolve_report",
        "dismiss_report",
        "cancel_submission",
        "remove_comment",
        "restore_comment",
        "resolve_comment_report",
        "dismiss_comment_report",
        "return",
      ],
      notice_kind: ["usn_dispute_opened", "usn_released"],
      opportunity_type: ["internship", "full_time", "both"],
      reason_code: ["nda", "personal_info", "defamation", "low_quality", "duplicate", "other"],
      report_reason: ["nda", "personal_info", "defamation", "spam", "fake", "other"],
      report_status: ["open", "actioned", "dismissed", "moot"],
      result_type: ["selected", "rejected", "waitlisted"],
      round_type: ["oa", "technical", "hr", "gd", "managerial"],
      user_role: ["student", "alumni", "moderator", "admin"],
      usn_case_state: [
        "opened",
        "under_review",
        "notice_sent",
        "contested",
        "approved",
        "denied",
        "executed",
        "closed",
      ],
    },
  },
} as const;
