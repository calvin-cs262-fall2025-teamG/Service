drop extension if exists "pg_net";

create sequence "public"."app_user_user_id_seq";

create sequence "public"."borrowinghistory_history_id_seq";

create sequence "public"."borrowingrequest_request_id_seq";

create sequence "public"."item_item_id_seq";

create sequence "public"."messages_message_id_seq";

create sequence "public"."organization_organization_id_seq";


  create table "public"."app_user" (
    "user_id" integer not null default nextval('public.app_user_user_id_seq'::regclass),
    "email" character varying(255) not null,
    "password_hash" character varying(255),
    "user_name" character varying(100) not null,
    "profile_picture" character varying(500),
    "verification_token" character varying(10),
    "is_verified" boolean default false,
    "token_expires_at" timestamp without time zone,
    "created_at" timestamp without time zone default CURRENT_TIMESTAMP
      );


alter table "public"."app_user" enable row level security;


  create table "public"."borrowinghistory" (
    "history_id" integer not null default nextval('public.borrowinghistory_history_id_seq'::regclass),
    "request_id" integer not null,
    "returned_at" timestamp without time zone
      );


alter table "public"."borrowinghistory" enable row level security;


  create table "public"."borrowingrequest" (
    "request_id" integer not null default nextval('public.borrowingrequest_request_id_seq'::regclass),
    "user_id" integer not null,
    "item_id" integer not null,
    "request_datetime" timestamp without time zone default CURRENT_TIMESTAMP
      );


alter table "public"."borrowingrequest" enable row level security;


  create table "public"."item" (
    "item_id" integer not null default nextval('public.item_item_id_seq'::regclass),
    "item_name" character varying(100) not null,
    "item_description" text,
    "image_url" character varying(500),
    "owner_id" integer not null,
    "request_status" character varying(20) not null default 'available'::character varying,
    "return_date" date,
    "created_at" timestamp without time zone default CURRENT_TIMESTAMP
      );


alter table "public"."item" enable row level security;


  create table "public"."messages" (
    "message_id" integer not null default nextval('public.messages_message_id_seq'::regclass),
    "sender_id" integer not null,
    "receiver_id" integer not null,
    "item_id" integer,
    "message_content" text not null,
    "sent_at" timestamp without time zone default CURRENT_TIMESTAMP
      );


alter table "public"."messages" enable row level security;


  create table "public"."organization" (
    "organization_id" integer not null default nextval('public.organization_organization_id_seq'::regclass),
    "organization_name" character varying(100) not null,
    "owner_id" integer not null
      );


alter table "public"."organization" enable row level security;


  create table "public"."organization_admin" (
    "organization_id" integer not null,
    "user_id" integer not null
      );


alter table "public"."organization_admin" enable row level security;


  create table "public"."organization_member" (
    "organization_id" integer not null,
    "user_id" integer not null
      );


alter table "public"."organization_member" enable row level security;

alter sequence "public"."app_user_user_id_seq" owned by "public"."app_user"."user_id";

alter sequence "public"."borrowinghistory_history_id_seq" owned by "public"."borrowinghistory"."history_id";

alter sequence "public"."borrowingrequest_request_id_seq" owned by "public"."borrowingrequest"."request_id";

alter sequence "public"."item_item_id_seq" owned by "public"."item"."item_id";

alter sequence "public"."messages_message_id_seq" owned by "public"."messages"."message_id";

alter sequence "public"."organization_organization_id_seq" owned by "public"."organization"."organization_id";

CREATE UNIQUE INDEX app_user_email_key ON public.app_user USING btree (email);

CREATE UNIQUE INDEX app_user_pkey ON public.app_user USING btree (user_id);

CREATE UNIQUE INDEX borrowinghistory_pkey ON public.borrowinghistory USING btree (history_id);

CREATE UNIQUE INDEX borrowingrequest_pkey ON public.borrowingrequest USING btree (request_id);

CREATE UNIQUE INDEX item_pkey ON public.item USING btree (item_id);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (message_id);

CREATE UNIQUE INDEX organization_pkey ON public.organization USING btree (organization_id);

alter table "public"."app_user" add constraint "app_user_pkey" PRIMARY KEY using index "app_user_pkey";

alter table "public"."borrowinghistory" add constraint "borrowinghistory_pkey" PRIMARY KEY using index "borrowinghistory_pkey";

alter table "public"."borrowingrequest" add constraint "borrowingrequest_pkey" PRIMARY KEY using index "borrowingrequest_pkey";

alter table "public"."item" add constraint "item_pkey" PRIMARY KEY using index "item_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."organization" add constraint "organization_pkey" PRIMARY KEY using index "organization_pkey";

alter table "public"."app_user" add constraint "app_user_email_key" UNIQUE using index "app_user_email_key";

alter table "public"."borrowinghistory" add constraint "borrowinghistory_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.borrowingrequest(request_id) ON DELETE CASCADE not valid;

alter table "public"."borrowinghistory" validate constraint "borrowinghistory_request_id_fkey";

alter table "public"."borrowingrequest" add constraint "borrowingrequest_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.item(item_id) ON DELETE CASCADE not valid;

alter table "public"."borrowingrequest" validate constraint "borrowingrequest_item_id_fkey";

alter table "public"."borrowingrequest" add constraint "borrowingrequest_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE not valid;

alter table "public"."borrowingrequest" validate constraint "borrowingrequest_user_id_fkey";

alter table "public"."item" add constraint "item_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE not valid;

alter table "public"."item" validate constraint "item_owner_id_fkey";

alter table "public"."messages" add constraint "messages_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.item(item_id) ON DELETE SET NULL not valid;

alter table "public"."messages" validate constraint "messages_item_id_fkey";

alter table "public"."messages" add constraint "messages_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_receiver_id_fkey";

alter table "public"."messages" add constraint "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_sender_id_fkey";

alter table "public"."organization" add constraint "organization_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE not valid;

alter table "public"."organization" validate constraint "organization_owner_id_fkey";

alter table "public"."organization_admin" add constraint "organization_admin_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE not valid;

alter table "public"."organization_admin" validate constraint "organization_admin_organization_id_fkey";

alter table "public"."organization_admin" add constraint "organization_admin_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE not valid;

alter table "public"."organization_admin" validate constraint "organization_admin_user_id_fkey";

alter table "public"."organization_member" add constraint "organization_member_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE not valid;

alter table "public"."organization_member" validate constraint "organization_member_organization_id_fkey";

alter table "public"."organization_member" add constraint "organization_member_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE not valid;

alter table "public"."organization_member" validate constraint "organization_member_user_id_fkey";

grant delete on table "public"."app_user" to "anon";

grant insert on table "public"."app_user" to "anon";

grant references on table "public"."app_user" to "anon";

grant select on table "public"."app_user" to "anon";

grant trigger on table "public"."app_user" to "anon";

grant truncate on table "public"."app_user" to "anon";

grant update on table "public"."app_user" to "anon";

grant delete on table "public"."app_user" to "authenticated";

grant insert on table "public"."app_user" to "authenticated";

grant references on table "public"."app_user" to "authenticated";

grant select on table "public"."app_user" to "authenticated";

grant trigger on table "public"."app_user" to "authenticated";

grant truncate on table "public"."app_user" to "authenticated";

grant update on table "public"."app_user" to "authenticated";

grant delete on table "public"."app_user" to "service_role";

grant insert on table "public"."app_user" to "service_role";

grant references on table "public"."app_user" to "service_role";

grant select on table "public"."app_user" to "service_role";

grant trigger on table "public"."app_user" to "service_role";

grant truncate on table "public"."app_user" to "service_role";

grant update on table "public"."app_user" to "service_role";

grant delete on table "public"."borrowinghistory" to "anon";

grant insert on table "public"."borrowinghistory" to "anon";

grant references on table "public"."borrowinghistory" to "anon";

grant select on table "public"."borrowinghistory" to "anon";

grant trigger on table "public"."borrowinghistory" to "anon";

grant truncate on table "public"."borrowinghistory" to "anon";

grant update on table "public"."borrowinghistory" to "anon";

grant delete on table "public"."borrowinghistory" to "authenticated";

grant insert on table "public"."borrowinghistory" to "authenticated";

grant references on table "public"."borrowinghistory" to "authenticated";

grant select on table "public"."borrowinghistory" to "authenticated";

grant trigger on table "public"."borrowinghistory" to "authenticated";

grant truncate on table "public"."borrowinghistory" to "authenticated";

grant update on table "public"."borrowinghistory" to "authenticated";

grant delete on table "public"."borrowinghistory" to "service_role";

grant insert on table "public"."borrowinghistory" to "service_role";

grant references on table "public"."borrowinghistory" to "service_role";

grant select on table "public"."borrowinghistory" to "service_role";

grant trigger on table "public"."borrowinghistory" to "service_role";

grant truncate on table "public"."borrowinghistory" to "service_role";

grant update on table "public"."borrowinghistory" to "service_role";

grant delete on table "public"."borrowingrequest" to "anon";

grant insert on table "public"."borrowingrequest" to "anon";

grant references on table "public"."borrowingrequest" to "anon";

grant select on table "public"."borrowingrequest" to "anon";

grant trigger on table "public"."borrowingrequest" to "anon";

grant truncate on table "public"."borrowingrequest" to "anon";

grant update on table "public"."borrowingrequest" to "anon";

grant delete on table "public"."borrowingrequest" to "authenticated";

grant insert on table "public"."borrowingrequest" to "authenticated";

grant references on table "public"."borrowingrequest" to "authenticated";

grant select on table "public"."borrowingrequest" to "authenticated";

grant trigger on table "public"."borrowingrequest" to "authenticated";

grant truncate on table "public"."borrowingrequest" to "authenticated";

grant update on table "public"."borrowingrequest" to "authenticated";

grant delete on table "public"."borrowingrequest" to "service_role";

grant insert on table "public"."borrowingrequest" to "service_role";

grant references on table "public"."borrowingrequest" to "service_role";

grant select on table "public"."borrowingrequest" to "service_role";

grant trigger on table "public"."borrowingrequest" to "service_role";

grant truncate on table "public"."borrowingrequest" to "service_role";

grant update on table "public"."borrowingrequest" to "service_role";

grant delete on table "public"."item" to "anon";

grant insert on table "public"."item" to "anon";

grant references on table "public"."item" to "anon";

grant select on table "public"."item" to "anon";

grant trigger on table "public"."item" to "anon";

grant truncate on table "public"."item" to "anon";

grant update on table "public"."item" to "anon";

grant delete on table "public"."item" to "authenticated";

grant insert on table "public"."item" to "authenticated";

grant references on table "public"."item" to "authenticated";

grant select on table "public"."item" to "authenticated";

grant trigger on table "public"."item" to "authenticated";

grant truncate on table "public"."item" to "authenticated";

grant update on table "public"."item" to "authenticated";

grant delete on table "public"."item" to "service_role";

grant insert on table "public"."item" to "service_role";

grant references on table "public"."item" to "service_role";

grant select on table "public"."item" to "service_role";

grant trigger on table "public"."item" to "service_role";

grant truncate on table "public"."item" to "service_role";

grant update on table "public"."item" to "service_role";

grant delete on table "public"."messages" to "anon";

grant insert on table "public"."messages" to "anon";

grant references on table "public"."messages" to "anon";

grant select on table "public"."messages" to "anon";

grant trigger on table "public"."messages" to "anon";

grant truncate on table "public"."messages" to "anon";

grant update on table "public"."messages" to "anon";

grant delete on table "public"."messages" to "authenticated";

grant insert on table "public"."messages" to "authenticated";

grant references on table "public"."messages" to "authenticated";

grant select on table "public"."messages" to "authenticated";

grant trigger on table "public"."messages" to "authenticated";

grant truncate on table "public"."messages" to "authenticated";

grant update on table "public"."messages" to "authenticated";

grant delete on table "public"."messages" to "service_role";

grant insert on table "public"."messages" to "service_role";

grant references on table "public"."messages" to "service_role";

grant select on table "public"."messages" to "service_role";

grant trigger on table "public"."messages" to "service_role";

grant truncate on table "public"."messages" to "service_role";

grant update on table "public"."messages" to "service_role";

grant delete on table "public"."organization" to "anon";

grant insert on table "public"."organization" to "anon";

grant references on table "public"."organization" to "anon";

grant select on table "public"."organization" to "anon";

grant trigger on table "public"."organization" to "anon";

grant truncate on table "public"."organization" to "anon";

grant update on table "public"."organization" to "anon";

grant delete on table "public"."organization" to "authenticated";

grant insert on table "public"."organization" to "authenticated";

grant references on table "public"."organization" to "authenticated";

grant select on table "public"."organization" to "authenticated";

grant trigger on table "public"."organization" to "authenticated";

grant truncate on table "public"."organization" to "authenticated";

grant update on table "public"."organization" to "authenticated";

grant delete on table "public"."organization" to "service_role";

grant insert on table "public"."organization" to "service_role";

grant references on table "public"."organization" to "service_role";

grant select on table "public"."organization" to "service_role";

grant trigger on table "public"."organization" to "service_role";

grant truncate on table "public"."organization" to "service_role";

grant update on table "public"."organization" to "service_role";

grant delete on table "public"."organization_admin" to "anon";

grant insert on table "public"."organization_admin" to "anon";

grant references on table "public"."organization_admin" to "anon";

grant select on table "public"."organization_admin" to "anon";

grant trigger on table "public"."organization_admin" to "anon";

grant truncate on table "public"."organization_admin" to "anon";

grant update on table "public"."organization_admin" to "anon";

grant delete on table "public"."organization_admin" to "authenticated";

grant insert on table "public"."organization_admin" to "authenticated";

grant references on table "public"."organization_admin" to "authenticated";

grant select on table "public"."organization_admin" to "authenticated";

grant trigger on table "public"."organization_admin" to "authenticated";

grant truncate on table "public"."organization_admin" to "authenticated";

grant update on table "public"."organization_admin" to "authenticated";

grant delete on table "public"."organization_admin" to "service_role";

grant insert on table "public"."organization_admin" to "service_role";

grant references on table "public"."organization_admin" to "service_role";

grant select on table "public"."organization_admin" to "service_role";

grant trigger on table "public"."organization_admin" to "service_role";

grant truncate on table "public"."organization_admin" to "service_role";

grant update on table "public"."organization_admin" to "service_role";

grant delete on table "public"."organization_member" to "anon";

grant insert on table "public"."organization_member" to "anon";

grant references on table "public"."organization_member" to "anon";

grant select on table "public"."organization_member" to "anon";

grant trigger on table "public"."organization_member" to "anon";

grant truncate on table "public"."organization_member" to "anon";

grant update on table "public"."organization_member" to "anon";

grant delete on table "public"."organization_member" to "authenticated";

grant insert on table "public"."organization_member" to "authenticated";

grant references on table "public"."organization_member" to "authenticated";

grant select on table "public"."organization_member" to "authenticated";

grant trigger on table "public"."organization_member" to "authenticated";

grant truncate on table "public"."organization_member" to "authenticated";

grant update on table "public"."organization_member" to "authenticated";

grant delete on table "public"."organization_member" to "service_role";

grant insert on table "public"."organization_member" to "service_role";

grant references on table "public"."organization_member" to "service_role";

grant select on table "public"."organization_member" to "service_role";

grant trigger on table "public"."organization_member" to "service_role";

grant truncate on table "public"."organization_member" to "service_role";

grant update on table "public"."organization_member" to "service_role";


