--
-- PostgreSQL database dump
--

-- Dumped from database version 9.5.13
-- Dumped by pg_dump version 9.5.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: hdb_catalog; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA hdb_catalog;


--
-- Name: hdb_views; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA hdb_views;


--
-- Name: plpgsql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;


--
-- Name: EXTENSION plpgsql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION plpgsql IS 'PL/pgSQL procedural language';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: hdb_schema_update_event_notifier(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog.hdb_schema_update_event_notifier() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    instance_id uuid;
    occurred_at timestamptz;
    curr_rec record;
  BEGIN
    instance_id = NEW.instance_id;
    occurred_at = NEW.occurred_at;
    PERFORM pg_notify('hasura_schema_update', json_build_object(
      'instance_id', instance_id,
      'occurred_at', occurred_at
      )::text);
    RETURN curr_rec;
  END;
$$;


--
-- Name: hdb_table_oid_check(); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog.hdb_table_oid_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    IF (EXISTS (SELECT 1 FROM information_schema.tables st WHERE st.table_schema = NEW.table_schema AND st.table_name = NEW.table_name)) THEN
      return NEW;
    ELSE
      RAISE foreign_key_violation using message = 'table_schema, table_name not in information_schema.tables';
      return NULL;
    END IF;
  END;
$$;


--
-- Name: inject_table_defaults(text, text, text, text); Type: FUNCTION; Schema: hdb_catalog; Owner: -
--

CREATE FUNCTION hdb_catalog.inject_table_defaults(view_schema text, view_name text, tab_schema text, tab_name text) RETURNS void
    LANGUAGE plpgsql
    AS $$
    DECLARE
        r RECORD;
    BEGIN
      FOR r IN SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = tab_schema AND table_name = tab_name AND column_default IS NOT NULL LOOP
          EXECUTE format('ALTER VIEW %I.%I ALTER COLUMN %I SET DEFAULT %s;', view_schema, view_name, r.column_name, r.column_default);
      END LOOP;
    END;
$$;


SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: event_invocation_logs; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.event_invocation_logs (
    id text DEFAULT public.gen_random_uuid() NOT NULL,
    event_id text,
    status integer,
    request json,
    response json,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: event_log; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.event_log (
    id text DEFAULT public.gen_random_uuid() NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    trigger_name text NOT NULL,
    payload jsonb NOT NULL,
    delivered boolean DEFAULT false NOT NULL,
    error boolean DEFAULT false NOT NULL,
    tries integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    locked boolean DEFAULT false NOT NULL,
    next_retry_at timestamp without time zone
);


--
-- Name: event_triggers; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.event_triggers (
    name text NOT NULL,
    type text NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    configuration json,
    comment text
);


--
-- Name: hdb_check_constraint; Type: VIEW; Schema: hdb_catalog; Owner: -
--

CREATE VIEW hdb_catalog.hdb_check_constraint AS
 SELECT (n.nspname)::text AS table_schema,
    (ct.relname)::text AS table_name,
    (r.conname)::text AS constraint_name,
    pg_get_constraintdef(r.oid, true) AS "check"
   FROM ((pg_constraint r
     JOIN pg_class ct ON ((r.conrelid = ct.oid)))
     JOIN pg_namespace n ON ((ct.relnamespace = n.oid)))
  WHERE (r.contype = 'c'::"char");


--
-- Name: hdb_foreign_key_constraint; Type: VIEW; Schema: hdb_catalog; Owner: -
--

CREATE VIEW hdb_catalog.hdb_foreign_key_constraint AS
 SELECT (q.table_schema)::text AS table_schema,
    (q.table_name)::text AS table_name,
    (q.constraint_name)::text AS constraint_name,
    (min(q.constraint_oid))::integer AS constraint_oid,
    min((q.ref_table_table_schema)::text) AS ref_table_table_schema,
    min((q.ref_table)::text) AS ref_table,
    json_object_agg(ac.attname, afc.attname) AS column_mapping,
    min((q.confupdtype)::text) AS on_update,
    min((q.confdeltype)::text) AS on_delete
   FROM ((( SELECT ctn.nspname AS table_schema,
            ct.relname AS table_name,
            r.conrelid AS table_id,
            r.conname AS constraint_name,
            r.oid AS constraint_oid,
            cftn.nspname AS ref_table_table_schema,
            cft.relname AS ref_table,
            r.confrelid AS ref_table_id,
            r.confupdtype,
            r.confdeltype,
            unnest(r.conkey) AS column_id,
            unnest(r.confkey) AS ref_column_id
           FROM ((((pg_constraint r
             JOIN pg_class ct ON ((r.conrelid = ct.oid)))
             JOIN pg_namespace ctn ON ((ct.relnamespace = ctn.oid)))
             JOIN pg_class cft ON ((r.confrelid = cft.oid)))
             JOIN pg_namespace cftn ON ((cft.relnamespace = cftn.oid)))
          WHERE (r.contype = 'f'::"char")) q
     JOIN pg_attribute ac ON (((q.column_id = ac.attnum) AND (q.table_id = ac.attrelid))))
     JOIN pg_attribute afc ON (((q.ref_column_id = afc.attnum) AND (q.ref_table_id = afc.attrelid))))
  GROUP BY q.table_schema, q.table_name, q.constraint_name;


--
-- Name: hdb_function; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_function (
    function_schema text NOT NULL,
    function_name text NOT NULL,
    is_system_defined boolean DEFAULT false
);


--
-- Name: hdb_function_agg; Type: VIEW; Schema: hdb_catalog; Owner: -
--

CREATE VIEW hdb_catalog.hdb_function_agg AS
 SELECT (p.proname)::text AS function_name,
    (pn.nspname)::text AS function_schema,
        CASE
            WHEN (p.provariadic = (0)::oid) THEN false
            ELSE true
        END AS has_variadic,
        CASE
            WHEN ((p.provolatile)::text = ('i'::character(1))::text) THEN 'IMMUTABLE'::text
            WHEN ((p.provolatile)::text = ('s'::character(1))::text) THEN 'STABLE'::text
            WHEN ((p.provolatile)::text = ('v'::character(1))::text) THEN 'VOLATILE'::text
            ELSE NULL::text
        END AS function_type,
    pg_get_functiondef(p.oid) AS function_definition,
    (rtn.nspname)::text AS return_type_schema,
    (rt.typname)::text AS return_type_name,
        CASE
            WHEN ((rt.typtype)::text = ('b'::character(1))::text) THEN 'BASE'::text
            WHEN ((rt.typtype)::text = ('c'::character(1))::text) THEN 'COMPOSITE'::text
            WHEN ((rt.typtype)::text = ('d'::character(1))::text) THEN 'DOMAIN'::text
            WHEN ((rt.typtype)::text = ('e'::character(1))::text) THEN 'ENUM'::text
            WHEN ((rt.typtype)::text = ('r'::character(1))::text) THEN 'RANGE'::text
            WHEN ((rt.typtype)::text = ('p'::character(1))::text) THEN 'PSUEDO'::text
            ELSE NULL::text
        END AS return_type_type,
    p.proretset AS returns_set,
    ( SELECT COALESCE(json_agg(q.type_name), '[]'::json) AS "coalesce"
           FROM ( SELECT pt.typname AS type_name,
                    pat.ordinality
                   FROM (unnest(COALESCE(p.proallargtypes, (p.proargtypes)::oid[])) WITH ORDINALITY pat(oid, ordinality)
                     LEFT JOIN pg_type pt ON ((pt.oid = pat.oid)))
                  ORDER BY pat.ordinality) q) AS input_arg_types,
    to_json(COALESCE(p.proargnames, ARRAY[]::text[])) AS input_arg_names
   FROM (((pg_proc p
     JOIN pg_namespace pn ON ((pn.oid = p.pronamespace)))
     JOIN pg_type rt ON ((rt.oid = p.prorettype)))
     JOIN pg_namespace rtn ON ((rtn.oid = rt.typnamespace)))
  WHERE (((pn.nspname)::text !~~ 'pg_%'::text) AND ((pn.nspname)::text <> ALL (ARRAY['information_schema'::text, 'hdb_catalog'::text, 'hdb_views'::text])) AND (NOT (EXISTS ( SELECT 1
           FROM pg_aggregate
          WHERE ((pg_aggregate.aggfnoid)::oid = p.oid)))));


--
-- Name: hdb_permission; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_permission (
    table_schema text NOT NULL,
    table_name text NOT NULL,
    role_name text NOT NULL,
    perm_type text NOT NULL,
    perm_def jsonb NOT NULL,
    comment text,
    is_system_defined boolean DEFAULT false,
    CONSTRAINT hdb_permission_perm_type_check CHECK ((perm_type = ANY (ARRAY['insert'::text, 'select'::text, 'update'::text, 'delete'::text])))
);


--
-- Name: hdb_permission_agg; Type: VIEW; Schema: hdb_catalog; Owner: -
--

CREATE VIEW hdb_catalog.hdb_permission_agg AS
 SELECT hdb_permission.table_schema,
    hdb_permission.table_name,
    hdb_permission.role_name,
    json_object_agg(hdb_permission.perm_type, hdb_permission.perm_def) AS permissions
   FROM hdb_catalog.hdb_permission
  GROUP BY hdb_permission.table_schema, hdb_permission.table_name, hdb_permission.role_name;


--
-- Name: hdb_primary_key; Type: VIEW; Schema: hdb_catalog; Owner: -
--

CREATE VIEW hdb_catalog.hdb_primary_key AS
 SELECT tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    json_agg(constraint_column_usage.column_name) AS columns
   FROM (information_schema.table_constraints tc
     JOIN ( SELECT x.tblschema AS table_schema,
            x.tblname AS table_name,
            x.colname AS column_name,
            x.cstrname AS constraint_name
           FROM ( SELECT DISTINCT nr.nspname,
                    r.relname,
                    a.attname,
                    c.conname
                   FROM pg_namespace nr,
                    pg_class r,
                    pg_attribute a,
                    pg_depend d,
                    pg_namespace nc,
                    pg_constraint c
                  WHERE ((nr.oid = r.relnamespace) AND (r.oid = a.attrelid) AND (d.refclassid = ('pg_class'::regclass)::oid) AND (d.refobjid = r.oid) AND (d.refobjsubid = a.attnum) AND (d.classid = ('pg_constraint'::regclass)::oid) AND (d.objid = c.oid) AND (c.connamespace = nc.oid) AND (c.contype = 'c'::"char") AND (r.relkind = ANY (ARRAY['r'::"char", 'p'::"char"])) AND (NOT a.attisdropped))
                UNION ALL
                 SELECT nr.nspname,
                    r.relname,
                    a.attname,
                    c.conname
                   FROM pg_namespace nr,
                    pg_class r,
                    pg_attribute a,
                    pg_namespace nc,
                    pg_constraint c
                  WHERE ((nr.oid = r.relnamespace) AND (r.oid = a.attrelid) AND (nc.oid = c.connamespace) AND (r.oid =
                        CASE c.contype
                            WHEN 'f'::"char" THEN c.confrelid
                            ELSE c.conrelid
                        END) AND (a.attnum = ANY (
                        CASE c.contype
                            WHEN 'f'::"char" THEN c.confkey
                            ELSE c.conkey
                        END)) AND (NOT a.attisdropped) AND (c.contype = ANY (ARRAY['p'::"char", 'u'::"char", 'f'::"char"])) AND (r.relkind = ANY (ARRAY['r'::"char", 'p'::"char"])))) x(tblschema, tblname, colname, cstrname)) constraint_column_usage ON ((((tc.constraint_name)::text = (constraint_column_usage.constraint_name)::text) AND ((tc.table_schema)::text = (constraint_column_usage.table_schema)::text) AND ((tc.table_name)::text = (constraint_column_usage.table_name)::text))))
  WHERE ((tc.constraint_type)::text = 'PRIMARY KEY'::text)
  GROUP BY tc.table_schema, tc.table_name, tc.constraint_name;


--
-- Name: hdb_query_template; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_query_template (
    template_name text NOT NULL,
    template_defn jsonb NOT NULL,
    comment text,
    is_system_defined boolean DEFAULT false
);


--
-- Name: hdb_relationship; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_relationship (
    table_schema text NOT NULL,
    table_name text NOT NULL,
    rel_name text NOT NULL,
    rel_type text,
    rel_def jsonb NOT NULL,
    comment text,
    is_system_defined boolean DEFAULT false,
    CONSTRAINT hdb_relationship_rel_type_check CHECK ((rel_type = ANY (ARRAY['object'::text, 'array'::text])))
);


--
-- Name: hdb_schema_update_event; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_schema_update_event (
    id bigint NOT NULL,
    instance_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hdb_schema_update_event_id_seq; Type: SEQUENCE; Schema: hdb_catalog; Owner: -
--

CREATE SEQUENCE hdb_catalog.hdb_schema_update_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hdb_schema_update_event_id_seq; Type: SEQUENCE OWNED BY; Schema: hdb_catalog; Owner: -
--

ALTER SEQUENCE hdb_catalog.hdb_schema_update_event_id_seq OWNED BY hdb_catalog.hdb_schema_update_event.id;


--
-- Name: hdb_table; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_table (
    table_schema text NOT NULL,
    table_name text NOT NULL,
    is_system_defined boolean DEFAULT false
);


--
-- Name: hdb_unique_constraint; Type: VIEW; Schema: hdb_catalog; Owner: -
--

CREATE VIEW hdb_catalog.hdb_unique_constraint AS
 SELECT tc.table_name,
    tc.constraint_schema AS table_schema,
    tc.constraint_name,
    json_agg(kcu.column_name) AS columns
   FROM (information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu USING (constraint_schema, constraint_name))
  WHERE ((tc.constraint_type)::text = 'UNIQUE'::text)
  GROUP BY tc.table_name, tc.constraint_schema, tc.constraint_name;


--
-- Name: hdb_version; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.hdb_version (
    hasura_uuid uuid DEFAULT public.gen_random_uuid() NOT NULL,
    version text NOT NULL,
    upgraded_on timestamp with time zone NOT NULL,
    cli_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    console_state jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: remote_schemas; Type: TABLE; Schema: hdb_catalog; Owner: -
--

CREATE TABLE hdb_catalog.remote_schemas (
    id bigint NOT NULL,
    name text,
    definition json,
    comment text
);


--
-- Name: remote_schemas_id_seq; Type: SEQUENCE; Schema: hdb_catalog; Owner: -
--

CREATE SEQUENCE hdb_catalog.remote_schemas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: remote_schemas_id_seq; Type: SEQUENCE OWNED BY; Schema: hdb_catalog; Owner: -
--

ALTER SEQUENCE hdb_catalog.remote_schemas_id_seq OWNED BY hdb_catalog.remote_schemas.id;


--
-- Name: auth_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_group (
    id integer NOT NULL,
    name character varying(150) NOT NULL
);


--
-- Name: auth_group_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_group_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_group_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_group_id_seq OWNED BY public.auth_group.id;


--
-- Name: auth_group_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_group_permissions (
    id integer NOT NULL,
    group_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: auth_group_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_group_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_group_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_group_permissions_id_seq OWNED BY public.auth_group_permissions.id;


--
-- Name: auth_permission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_permission (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    content_type_id integer NOT NULL,
    codename character varying(100) NOT NULL
);


--
-- Name: auth_permission_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_permission_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_permission_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_permission_id_seq OWNED BY public.auth_permission.id;


--
-- Name: auth_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_user (
    id integer NOT NULL,
    password character varying(128) NOT NULL,
    last_login timestamp with time zone,
    is_superuser boolean NOT NULL,
    username character varying(150) NOT NULL,
    first_name character varying(30) NOT NULL,
    last_name character varying(150) NOT NULL,
    email character varying(254) NOT NULL,
    is_staff boolean NOT NULL,
    is_active boolean NOT NULL,
    date_joined timestamp with time zone NOT NULL
);


--
-- Name: auth_user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_user_groups (
    id integer NOT NULL,
    user_id integer NOT NULL,
    group_id integer NOT NULL
);


--
-- Name: auth_user_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_user_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_user_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_user_groups_id_seq OWNED BY public.auth_user_groups.id;


--
-- Name: auth_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_user_id_seq OWNED BY public.auth_user.id;


--
-- Name: auth_user_user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_user_user_permissions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: auth_user_user_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_user_user_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_user_user_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_user_user_permissions_id_seq OWNED BY public.auth_user_user_permissions.id;


--
-- Name: chat_room; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_room (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    staff_only boolean NOT NULL
);


--
-- Name: chat_room_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_room_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_room_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_room_id_seq OWNED BY public.chat_room.id;


--
-- Name: django_admin_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_admin_log (
    id integer NOT NULL,
    action_time timestamp with time zone NOT NULL,
    object_id text,
    object_repr character varying(200) NOT NULL,
    action_flag smallint NOT NULL,
    change_message text NOT NULL,
    content_type_id integer,
    user_id integer NOT NULL,
    CONSTRAINT django_admin_log_action_flag_check CHECK ((action_flag >= 0))
);


--
-- Name: django_admin_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.django_admin_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: django_admin_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.django_admin_log_id_seq OWNED BY public.django_admin_log.id;


--
-- Name: django_content_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_content_type (
    id integer NOT NULL,
    app_label character varying(100) NOT NULL,
    model character varying(100) NOT NULL
);


--
-- Name: django_content_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.django_content_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: django_content_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.django_content_type_id_seq OWNED BY public.django_content_type.id;


--
-- Name: django_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_migrations (
    id integer NOT NULL,
    app character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    applied timestamp with time zone NOT NULL
);


--
-- Name: django_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.django_migrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: django_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.django_migrations_id_seq OWNED BY public.django_migrations.id;


--
-- Name: django_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_session (
    session_key character varying(40) NOT NULL,
    session_data text NOT NULL,
    expire_date timestamp with time zone NOT NULL
);


--
-- Name: exchange_app_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_account (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    org_id character varying(32) NOT NULL
);


--
-- Name: exchange_app_account_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_app_account_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_app_account_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_app_account_id_seq OWNED BY public.exchange_app_account.id;


--
-- Name: exchange_app_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_balance (
    id integer NOT NULL,
    balance numeric(12,4) NOT NULL,
    overdraft_limit numeric(12,4) NOT NULL,
    account_id integer NOT NULL,
    currency_id character varying(32) NOT NULL
);


--
-- Name: exchange_app_balance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_app_balance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_app_balance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_app_balance_id_seq OWNED BY public.exchange_app_balance.id;


--
-- Name: exchange_app_currency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_currency (
    abbrev character varying(32) NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: exchange_app_instrument; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_instrument (
    symbol character varying(32) NOT NULL,
    name character varying(255) NOT NULL,
    currency_id character varying(32) NOT NULL,
    begin_time timestamp with time zone NOT NULL,
    expiration timestamp with time zone,
    max_price double precision NOT NULL,
    min_price double precision NOT NULL,
    owner_id integer NOT NULL,
    price_incr double precision NOT NULL,
    price_mult double precision NOT NULL,
    price_unit_id character varying(32) NOT NULL,
    qty_incr double precision NOT NULL,
    qty_mult double precision NOT NULL,
    qty_unit_id character varying(32) NOT NULL,
    type_id character varying(32) NOT NULL
);


--
-- Name: exchange_app_instrumenttype; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_instrumenttype (
    abbrev character varying(32) NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: exchange_app_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_order (
    id integer NOT NULL,
    begin_time timestamp with time zone NOT NULL,
    expiration timestamp with time zone NOT NULL,
    is_buy boolean NOT NULL,
    quantity numeric(12,4) NOT NULL,
    limit_price numeric(12,4) NOT NULL,
    filled_quantity numeric(12,4) NOT NULL,
    account_id integer NOT NULL,
    instrument_id character varying(32) NOT NULL,
    status_id character varying(32) NOT NULL,
    trader_id integer NOT NULL,
    type_id character varying(32) NOT NULL,
    max_show_size numeric(12,1)
);


--
-- Name: exchange_app_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_app_order_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_app_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_app_order_id_seq OWNED BY public.exchange_app_order.id;


--
-- Name: exchange_app_orderstatus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_orderstatus (
    abbrev character varying(32) NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: exchange_app_ordertype; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_ordertype (
    abbrev character varying(32) NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: exchange_app_organization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_organization (
    abbrev character varying(32) NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: exchange_app_trade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_trade (
    id integer NOT NULL,
    quantity numeric(12,4) NOT NULL,
    price numeric(12,4) NOT NULL,
    is_buyer_taker boolean NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    buyer_id integer NOT NULL,
    instrument_id character varying(32) NOT NULL,
    seller_id integer NOT NULL
);


--
-- Name: exchange_app_trade_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_app_trade_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_app_trade_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_app_trade_id_seq OWNED BY public.exchange_app_trade.id;


--
-- Name: exchange_app_trader; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_trader (
    user_id integer NOT NULL,
    org_id character varying(32) NOT NULL
);


--
-- Name: exchange_app_traderpermission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_traderpermission (
    id integer NOT NULL,
    permission character varying(10) NOT NULL,
    trader_id integer NOT NULL,
    account_id integer NOT NULL
);


--
-- Name: exchange_app_traderpermission_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_app_traderpermission_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_app_traderpermission_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_app_traderpermission_id_seq OWNED BY public.exchange_app_traderpermission.id;


--
-- Name: exchange_app_unit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_app_unit (
    abbrev character varying(32) NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: social_auth_association; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_auth_association (
    id integer NOT NULL,
    server_url character varying(255) NOT NULL,
    handle character varying(255) NOT NULL,
    secret character varying(255) NOT NULL,
    issued integer NOT NULL,
    lifetime integer NOT NULL,
    assoc_type character varying(64) NOT NULL
);


--
-- Name: social_auth_association_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.social_auth_association_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: social_auth_association_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.social_auth_association_id_seq OWNED BY public.social_auth_association.id;


--
-- Name: social_auth_code; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_auth_code (
    id integer NOT NULL,
    email character varying(254) NOT NULL,
    code character varying(32) NOT NULL,
    verified boolean NOT NULL,
    "timestamp" timestamp with time zone NOT NULL
);


--
-- Name: social_auth_code_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.social_auth_code_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: social_auth_code_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.social_auth_code_id_seq OWNED BY public.social_auth_code.id;


--
-- Name: social_auth_nonce; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_auth_nonce (
    id integer NOT NULL,
    server_url character varying(255) NOT NULL,
    "timestamp" integer NOT NULL,
    salt character varying(65) NOT NULL
);


--
-- Name: social_auth_nonce_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.social_auth_nonce_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: social_auth_nonce_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.social_auth_nonce_id_seq OWNED BY public.social_auth_nonce.id;


--
-- Name: social_auth_partial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_auth_partial (
    id integer NOT NULL,
    token character varying(32) NOT NULL,
    next_step smallint NOT NULL,
    backend character varying(32) NOT NULL,
    data text NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    CONSTRAINT social_auth_partial_next_step_check CHECK ((next_step >= 0))
);


--
-- Name: social_auth_partial_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.social_auth_partial_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: social_auth_partial_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.social_auth_partial_id_seq OWNED BY public.social_auth_partial.id;


--
-- Name: social_auth_usersocialauth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_auth_usersocialauth (
    id integer NOT NULL,
    provider character varying(32) NOT NULL,
    uid character varying(255) NOT NULL,
    extra_data text NOT NULL,
    user_id integer NOT NULL
);


--
-- Name: social_auth_usersocialauth_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.social_auth_usersocialauth_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: social_auth_usersocialauth_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.social_auth_usersocialauth_id_seq OWNED BY public.social_auth_usersocialauth.id;


--
-- Name: id; Type: DEFAULT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_schema_update_event ALTER COLUMN id SET DEFAULT nextval('hdb_catalog.hdb_schema_update_event_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.remote_schemas ALTER COLUMN id SET DEFAULT nextval('hdb_catalog.remote_schemas_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group ALTER COLUMN id SET DEFAULT nextval('public.auth_group_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions ALTER COLUMN id SET DEFAULT nextval('public.auth_group_permissions_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_permission ALTER COLUMN id SET DEFAULT nextval('public.auth_permission_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user ALTER COLUMN id SET DEFAULT nextval('public.auth_user_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_groups ALTER COLUMN id SET DEFAULT nextval('public.auth_user_groups_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_user_permissions ALTER COLUMN id SET DEFAULT nextval('public.auth_user_user_permissions_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room ALTER COLUMN id SET DEFAULT nextval('public.chat_room_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_admin_log ALTER COLUMN id SET DEFAULT nextval('public.django_admin_log_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_content_type ALTER COLUMN id SET DEFAULT nextval('public.django_content_type_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_migrations ALTER COLUMN id SET DEFAULT nextval('public.django_migrations_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_account ALTER COLUMN id SET DEFAULT nextval('public.exchange_app_account_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_balance ALTER COLUMN id SET DEFAULT nextval('public.exchange_app_balance_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_order ALTER COLUMN id SET DEFAULT nextval('public.exchange_app_order_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_trade ALTER COLUMN id SET DEFAULT nextval('public.exchange_app_trade_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_traderpermission ALTER COLUMN id SET DEFAULT nextval('public.exchange_app_traderpermission_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_association ALTER COLUMN id SET DEFAULT nextval('public.social_auth_association_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_code ALTER COLUMN id SET DEFAULT nextval('public.social_auth_code_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_nonce ALTER COLUMN id SET DEFAULT nextval('public.social_auth_nonce_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_partial ALTER COLUMN id SET DEFAULT nextval('public.social_auth_partial_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_usersocialauth ALTER COLUMN id SET DEFAULT nextval('public.social_auth_usersocialauth_id_seq'::regclass);


--
-- Data for Name: event_invocation_logs; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.event_invocation_logs (id, event_id, status, request, response, created_at) FROM stdin;
\.


--
-- Data for Name: event_log; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.event_log (id, schema_name, table_name, trigger_name, payload, delivered, error, tries, created_at, locked, next_retry_at) FROM stdin;
\.


--
-- Data for Name: event_triggers; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.event_triggers (name, type, schema_name, table_name, configuration, comment) FROM stdin;
\.


--
-- Data for Name: hdb_function; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.hdb_function (function_schema, function_name, is_system_defined) FROM stdin;
\.


--
-- Data for Name: hdb_permission; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.hdb_permission (table_schema, table_name, role_name, perm_type, perm_def, comment, is_system_defined) FROM stdin;
\.


--
-- Data for Name: hdb_query_template; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.hdb_query_template (template_name, template_defn, comment, is_system_defined) FROM stdin;
\.


--
-- Data for Name: hdb_relationship; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.hdb_relationship (table_schema, table_name, rel_name, rel_type, rel_def, comment, is_system_defined) FROM stdin;
hdb_catalog	hdb_table	detail	object	{"manual_configuration": {"remote_table": {"name": "tables", "schema": "information_schema"}, "column_mapping": {"table_name": "table_name", "table_schema": "table_schema"}}}	\N	t
hdb_catalog	hdb_table	primary_key	object	{"manual_configuration": {"remote_table": {"name": "hdb_primary_key", "schema": "hdb_catalog"}, "column_mapping": {"table_name": "table_name", "table_schema": "table_schema"}}}	\N	t
hdb_catalog	hdb_table	columns	array	{"manual_configuration": {"remote_table": {"name": "columns", "schema": "information_schema"}, "column_mapping": {"table_name": "table_name", "table_schema": "table_schema"}}}	\N	t
hdb_catalog	hdb_table	foreign_key_constraints	array	{"manual_configuration": {"remote_table": {"name": "hdb_foreign_key_constraint", "schema": "hdb_catalog"}, "column_mapping": {"table_name": "table_name", "table_schema": "table_schema"}}}	\N	t
hdb_catalog	hdb_table	relationships	array	{"manual_configuration": {"remote_table": {"name": "hdb_relationship", "schema": "hdb_catalog"}, "column_mapping": {"table_name": "table_name", "table_schema": "table_schema"}}}	\N	t
hdb_catalog	hdb_table	permissions	array	{"manual_configuration": {"remote_table": {"name": "hdb_permission_agg", "schema": "hdb_catalog"}, "column_mapping": {"table_name": "table_name", "table_schema": "table_schema"}}}	\N	t
hdb_catalog	hdb_table	check_constraints	array	{"manual_configuration": {"remote_table": {"name": "hdb_check_constraint", "schema": "hdb_catalog"}, "column_mapping": {"table_name": "table_name", "table_schema": "table_schema"}}}	\N	t
hdb_catalog	hdb_table	unique_constraints	array	{"manual_configuration": {"remote_table": {"name": "hdb_unique_constraint", "schema": "hdb_catalog"}, "column_mapping": {"table_name": "table_name", "table_schema": "table_schema"}}}	\N	t
hdb_catalog	event_log	trigger	object	{"manual_configuration": {"remote_table": {"name": "event_triggers", "schema": "hdb_catalog"}, "column_mapping": {"trigger_name": "name"}}}	\N	t
hdb_catalog	event_triggers	events	array	{"manual_configuration": {"remote_table": {"name": "event_log", "schema": "hdb_catalog"}, "column_mapping": {"name": "trigger_name"}}}	\N	t
hdb_catalog	event_invocation_logs	event	object	{"foreign_key_constraint_on": "event_id"}	\N	t
hdb_catalog	event_log	logs	array	{"foreign_key_constraint_on": {"table": {"name": "event_invocation_logs", "schema": "hdb_catalog"}, "column": "event_id"}}	\N	t
hdb_catalog	hdb_function_agg	return_table_info	object	{"manual_configuration": {"remote_table": {"name": "hdb_table", "schema": "hdb_catalog"}, "column_mapping": {"return_type_name": "table_name", "return_type_schema": "table_schema"}}}	\N	t
\.


--
-- Data for Name: hdb_schema_update_event; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.hdb_schema_update_event (id, instance_id, occurred_at) FROM stdin;
\.


--
-- Name: hdb_schema_update_event_id_seq; Type: SEQUENCE SET; Schema: hdb_catalog; Owner: -
--

SELECT pg_catalog.setval('hdb_catalog.hdb_schema_update_event_id_seq', 1, false);


--
-- Data for Name: hdb_table; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.hdb_table (table_schema, table_name, is_system_defined) FROM stdin;
hdb_catalog	hdb_table	t
information_schema	tables	t
information_schema	schemata	t
information_schema	views	t
hdb_catalog	hdb_primary_key	t
information_schema	columns	t
hdb_catalog	hdb_foreign_key_constraint	t
hdb_catalog	hdb_relationship	t
hdb_catalog	hdb_permission_agg	t
hdb_catalog	hdb_check_constraint	t
hdb_catalog	hdb_unique_constraint	t
hdb_catalog	hdb_query_template	t
hdb_catalog	event_triggers	t
hdb_catalog	event_log	t
hdb_catalog	event_invocation_logs	t
hdb_catalog	hdb_function_agg	t
hdb_catalog	hdb_function	t
hdb_catalog	remote_schemas	t
hdb_catalog	hdb_version	t
\.


--
-- Data for Name: hdb_version; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.hdb_version (hasura_uuid, version, upgraded_on, cli_state, console_state) FROM stdin;
4ccf746c-4183-44ab-9f8a-43ed358b1a6f	13	2019-04-17 03:45:00.032626+00	{}	{}
\.


--
-- Data for Name: remote_schemas; Type: TABLE DATA; Schema: hdb_catalog; Owner: -
--

COPY hdb_catalog.remote_schemas (id, name, definition, comment) FROM stdin;
\.


--
-- Name: remote_schemas_id_seq; Type: SEQUENCE SET; Schema: hdb_catalog; Owner: -
--

SELECT pg_catalog.setval('hdb_catalog.remote_schemas_id_seq', 1, false);


--
-- Data for Name: auth_group; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_group (id, name) FROM stdin;
1	Family and Friends
\.


--
-- Name: auth_group_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auth_group_id_seq', 1, true);


--
-- Data for Name: auth_group_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_group_permissions (id, group_id, permission_id) FROM stdin;
\.


--
-- Name: auth_group_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auth_group_permissions_id_seq', 1, false);


--
-- Data for Name: auth_permission; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_permission (id, name, content_type_id, codename) FROM stdin;
1	Can add permission	1	add_permission
2	Can change permission	1	change_permission
3	Can delete permission	1	delete_permission
4	Can view permission	1	view_permission
5	Can add group	2	add_group
6	Can change group	2	change_group
7	Can delete group	2	delete_group
8	Can view group	2	view_group
9	Can add user	3	add_user
10	Can change user	3	change_user
11	Can delete user	3	delete_user
12	Can view user	3	view_user
13	Can add content type	4	add_contenttype
14	Can change content type	4	change_contenttype
15	Can delete content type	4	delete_contenttype
16	Can view content type	4	view_contenttype
17	Can add session	5	add_session
18	Can change session	5	change_session
19	Can delete session	5	delete_session
20	Can view session	5	view_session
21	Can add association	6	add_association
22	Can change association	6	change_association
23	Can delete association	6	delete_association
24	Can view association	6	view_association
25	Can add code	7	add_code
26	Can change code	7	change_code
27	Can delete code	7	delete_code
28	Can view code	7	view_code
29	Can add nonce	8	add_nonce
30	Can change nonce	8	change_nonce
31	Can delete nonce	8	delete_nonce
32	Can view nonce	8	view_nonce
33	Can add user social auth	9	add_usersocialauth
34	Can change user social auth	9	change_usersocialauth
35	Can delete user social auth	9	delete_usersocialauth
36	Can view user social auth	9	view_usersocialauth
37	Can add partial	10	add_partial
38	Can change partial	10	change_partial
39	Can delete partial	10	delete_partial
40	Can view partial	10	view_partial
41	Can add unit	11	add_unit
42	Can change unit	11	change_unit
43	Can delete unit	11	delete_unit
44	Can view unit	11	view_unit
45	Can add currency	12	add_currency
46	Can change currency	12	change_currency
47	Can delete currency	12	delete_currency
48	Can view currency	12	view_currency
49	Can add instrument	13	add_instrument
50	Can change instrument	13	change_instrument
51	Can delete instrument	13	delete_instrument
52	Can view instrument	13	view_instrument
53	Can add account	14	add_account
54	Can change account	14	change_account
55	Can delete account	14	delete_account
56	Can view account	14	view_account
57	Can add instrument type	15	add_instrumenttype
58	Can change instrument type	15	change_instrumenttype
59	Can delete instrument type	15	delete_instrumenttype
60	Can view instrument type	15	view_instrumenttype
61	Can add order status	16	add_orderstatus
62	Can change order status	16	change_orderstatus
63	Can delete order status	16	delete_orderstatus
64	Can view order status	16	view_orderstatus
65	Can add order type	17	add_ordertype
66	Can change order type	17	change_ordertype
67	Can delete order type	17	delete_ordertype
68	Can view order type	17	view_ordertype
69	Can add organization	18	add_organization
70	Can change organization	18	change_organization
71	Can delete organization	18	delete_organization
72	Can view organization	18	view_organization
73	Can add trader	19	add_trader
74	Can change trader	19	change_trader
75	Can delete trader	19	delete_trader
76	Can view trader	19	view_trader
77	Can add trader permission	20	add_traderpermission
78	Can change trader permission	20	change_traderpermission
79	Can delete trader permission	20	delete_traderpermission
80	Can view trader permission	20	view_traderpermission
81	Can add trade	21	add_trade
82	Can change trade	21	change_trade
83	Can delete trade	21	delete_trade
84	Can view trade	21	view_trade
85	Can add order	22	add_order
86	Can change order	22	change_order
87	Can delete order	22	delete_order
88	Can view order	22	view_order
89	Can add log entry	23	add_logentry
90	Can change log entry	23	change_logentry
91	Can delete log entry	23	delete_logentry
92	Can view log entry	23	view_logentry
93	Can add balance	24	add_balance
94	Can change balance	24	change_balance
95	Can delete balance	24	delete_balance
96	Can view balance	24	view_balance
97	Can add room	25	add_room
98	Can change room	25	change_room
99	Can delete room	25	delete_room
100	Can view room	25	view_room
\.


--
-- Name: auth_permission_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auth_permission_id_seq', 100, true);


--
-- Data for Name: auth_user; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_user (id, password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined) FROM stdin;
7	!tHLgpGKtww7oLUb4VEpHyUfS7jzHLptGZKeBh07z	2019-04-16 19:01:26+00	t	donthireddy	Muralidhar Reddy Donthireddy		donthireddy@yahoo.com	t	t	2019-04-16 18:39:52+00
6	!2RWH84cvjofkfKCbGGea1pmW7lAhkUDMibAWkHmF	2019-04-18 14:20:48.350766+00	t	maverickone	Murali D		maverickone@gmail.com	t	t	2019-04-16 18:38:28+00
2	pbkdf2_sha256$150000$RZcpFHTrjl2Y$7p29kuX9OxWFsGCLYTLhY6KVzsBz0chKTgFOez1f8Q0=	2019-04-18 14:28:20+00	t	murali	Murali	Donthireddy	maverickone@gmail.com	t	t	2019-04-16 17:20:06+00
8	!nJnR3adYUCfHR4O8kA7RLHiUy9u7anQu6GDXqKCq	2019-04-20 19:27:59.485871+00	t	gayamtech	Anuha Gayam		gayamtech@gmail.com	t	t	2019-04-18 00:08:42+00
\.


--
-- Data for Name: auth_user_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_user_groups (id, user_id, group_id) FROM stdin;
\.


--
-- Name: auth_user_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auth_user_groups_id_seq', 1, false);


--
-- Name: auth_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auth_user_id_seq', 8, true);


--
-- Data for Name: auth_user_user_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_user_user_permissions (id, user_id, permission_id) FROM stdin;
\.


--
-- Name: auth_user_user_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auth_user_user_permissions_id_seq', 1, false);


--
-- Data for Name: chat_room; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_room (id, title, staff_only) FROM stdin;
1	AdviAnuMurali	f
\.


--
-- Name: chat_room_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chat_room_id_seq', 1, true);


--
-- Data for Name: django_admin_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.django_admin_log (id, action_time, object_id, object_repr, action_flag, change_message, content_type_id, user_id) FROM stdin;
1	2019-04-16 17:32:14.954138+00	1	maverickone	2	[{"changed": {"fields": ["email"]}}]	3	2
2	2019-04-16 17:39:56.009727+00	1	maverickone	2	[{"changed": {"fields": ["is_staff", "is_superuser"]}}]	3	2
3	2019-04-16 17:51:39.561081+00	2	MuralidharReddyDonthireddy	3		9	2
4	2019-04-16 17:51:39.562798+00	1	maverickone	3		9	2
5	2019-04-16 17:52:15.67588+00	1	maverickone	3		3	2
6	2019-04-16 17:52:15.677448+00	3	MuralidharReddyDonthireddy	3		3	2
7	2019-04-16 18:33:25.058257+00	5	donthireddy	3		3	2
8	2019-04-16 18:33:25.060286+00	4	maverickone	3		3	2
9	2019-04-18 00:09:58.789592+00	8	gayamtech	2	[{"changed": {"fields": ["is_staff", "is_superuser"]}}]	3	2
10	2019-04-18 00:11:18.944707+00	Event	Event	1	[{"added": {}}]	15	8
11	2019-04-18 00:12:11.77745+00	Stock	Stock	1	[{"added": {}}]	15	8
12	2019-04-18 00:14:01.359195+00	BLR	BLR	1	[{"added": {}}]	12	8
13	2019-04-18 00:16:39.530226+00	%Prob	%Prob	1	[{"added": {}}]	11	8
14	2019-04-18 00:18:58.615682+00	DFLT	DFLT	1	[{"added": {}}]	11	8
15	2019-04-18 00:19:03.549049+00	IndPakWC19	IndPakWC19	1	[{"added": {}}]	13	8
16	2019-04-18 13:59:57.519733+00	6	maverickone	2	[{"changed": {"fields": ["is_staff", "is_superuser"]}}]	3	2
17	2019-04-18 14:00:22.133508+00	7	donthireddy	2	[{"changed": {"fields": ["is_staff", "is_superuser"]}}]	3	2
18	2019-04-18 14:28:27.745939+00	2	murali	2	[{"changed": {"fields": ["first_name", "last_name", "last_login"]}}]	3	6
19	2019-04-18 14:29:05.608524+00	1	Family and Friends	1	[{"added": {}}]	2	6
20	2019-04-20 19:30:26.966539+00	1	AdviAnuMurali	1	[{"added": {}}]	25	7
21	2019-04-20 19:34:31.733618+00	AAM	AAM	1	[{"added": {}}]	18	7
22	2019-04-20 19:34:45.388258+00	1	AAM a/c 1	1	[{"added": {}}]	14	7
23	2019-04-20 19:35:03.69132+00	7	Trader donthireddy	1	[{"added": {}}]	19	7
24	2019-04-20 19:35:37.441586+00	LMT	LMT	1	[{"added": {}}]	17	7
25	2019-04-20 19:35:55.48957+00	2	Account 1	1	[{"added": {}}]	14	8
26	2019-04-20 19:36:27.748554+00	WORKING	WORKING	1	[{"added": {}}]	16	7
27	2019-04-20 19:36:44.105075+00	8	Trader gayamtech	1	[{"added": {}}]	19	8
28	2019-04-20 19:36:49.003395+00	8	Trader gayamtech	2	[]	19	8
29	2019-04-20 19:37:29.158556+00	CANCELED	CANCELED	1	[{"added": {}}]	16	7
30	2019-04-20 19:37:44.929101+00	KILLED	KILLED	1	[{"added": {}}]	16	7
31	2019-04-20 19:38:09.016295+00	COMPLETED	COMPLETED	1	[{"added": {}}]	16	7
32	2019-04-20 19:38:29.083889+00	1	IndPakWC19 100@49 Trader donthireddy	1	[{"added": {}}]	22	7
33	2019-04-20 19:38:31.542711+00	2	IndPakWC19 20@65 Trader gayamtech	1	[{"added": {}}]	22	8
34	2019-04-20 19:39:33.374712+00	3	IndPakWC19 100@40 Trader donthireddy	1	[{"added": {}}]	22	7
35	2019-04-20 19:40:18.123858+00	4	IndPakWC19 40@60 Trader gayamtech	1	[{"added": {}}]	22	8
\.


--
-- Name: django_admin_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.django_admin_log_id_seq', 35, true);


--
-- Data for Name: django_content_type; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.django_content_type (id, app_label, model) FROM stdin;
1	auth	permission
2	auth	group
3	auth	user
4	contenttypes	contenttype
5	sessions	session
6	social_django	association
7	social_django	code
8	social_django	nonce
9	social_django	usersocialauth
10	social_django	partial
11	exchange_app	unit
12	exchange_app	currency
13	exchange_app	instrument
14	exchange_app	account
15	exchange_app	instrumenttype
16	exchange_app	orderstatus
17	exchange_app	ordertype
18	exchange_app	organization
19	exchange_app	trader
20	exchange_app	traderpermission
21	exchange_app	trade
22	exchange_app	order
23	admin	logentry
24	exchange_app	balance
25	chat	room
\.


--
-- Name: django_content_type_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.django_content_type_id_seq', 25, true);


--
-- Data for Name: django_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.django_migrations (id, app, name, applied) FROM stdin;
1	contenttypes	0001_initial	2019-04-16 17:12:46.275189+00
2	auth	0001_initial	2019-04-16 17:12:46.309352+00
3	admin	0001_initial	2019-04-16 17:12:46.34751+00
4	admin	0002_logentry_remove_auto_add	2019-04-16 17:12:46.362196+00
5	admin	0003_logentry_add_action_flag_choices	2019-04-16 17:12:46.371564+00
6	contenttypes	0002_remove_content_type_name	2019-04-16 17:12:46.39027+00
7	auth	0002_alter_permission_name_max_length	2019-04-16 17:12:46.395519+00
8	auth	0003_alter_user_email_max_length	2019-04-16 17:12:46.404545+00
9	auth	0004_alter_user_username_opts	2019-04-16 17:12:46.41355+00
10	auth	0005_alter_user_last_login_null	2019-04-16 17:12:46.424046+00
11	auth	0006_require_contenttypes_0002	2019-04-16 17:12:46.426009+00
12	auth	0007_alter_validators_add_error_messages	2019-04-16 17:12:46.434751+00
13	auth	0008_alter_user_username_max_length	2019-04-16 17:12:46.446216+00
14	auth	0009_alter_user_last_name_max_length	2019-04-16 17:12:46.455247+00
15	auth	0010_alter_group_name_max_length	2019-04-16 17:12:46.464245+00
16	auth	0011_update_proxy_permissions	2019-04-16 17:12:46.473046+00
17	exchange_app	0001_initial	2019-04-16 17:12:46.479406+00
18	exchange_app	0002_auto_20190414_2054	2019-04-16 17:12:46.495863+00
19	exchange_app	0003_auto_20190414_2136	2019-04-16 17:12:46.504524+00
20	exchange_app	0004_auto_20190414_2337	2019-04-16 17:12:46.810428+00
21	sessions	0001_initial	2019-04-16 17:12:46.87069+00
22	default	0001_initial	2019-04-16 17:12:46.943018+00
23	social_auth	0001_initial	2019-04-16 17:12:46.944617+00
24	default	0002_add_related_name	2019-04-16 17:12:46.97126+00
25	social_auth	0002_add_related_name	2019-04-16 17:12:46.972362+00
26	default	0003_alter_email_max_length	2019-04-16 17:12:46.977574+00
27	social_auth	0003_alter_email_max_length	2019-04-16 17:12:46.978725+00
28	default	0004_auto_20160423_0400	2019-04-16 17:12:46.989093+00
29	social_auth	0004_auto_20160423_0400	2019-04-16 17:12:46.990126+00
30	social_auth	0005_auto_20160727_2333	2019-04-16 17:12:46.997193+00
31	social_django	0006_partial	2019-04-16 17:12:47.004759+00
32	social_django	0007_code_timestamp	2019-04-16 17:12:47.01709+00
33	social_django	0008_partial_timestamp	2019-04-16 17:12:47.02855+00
34	social_django	0004_auto_20160423_0400	2019-04-16 17:12:47.033174+00
35	social_django	0003_alter_email_max_length	2019-04-16 17:12:47.034544+00
36	social_django	0001_initial	2019-04-16 17:12:47.035977+00
37	social_django	0005_auto_20160727_2333	2019-04-16 17:12:47.037337+00
38	social_django	0002_add_related_name	2019-04-16 17:12:47.038658+00
39	exchange_app	0005_auto_20190416_1235	2019-04-17 17:48:57.26324+00
40	exchange_app	0006_order_max_show_size	2019-04-18 13:55:00.058963+00
41	exchange_app	0007_balance	2019-04-18 13:55:00.10532+00
42	chat	0001_initial	2019-04-20 19:29:35.789098+00
43	exchange_app	0008_auto_20190418_0236	2019-04-20 19:29:35.847073+00
\.


--
-- Name: django_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.django_migrations_id_seq', 43, true);


--
-- Data for Name: django_session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.django_session (session_key, session_data, expire_date) FROM stdin;
72po65cv3ewo26zxzng389xahlu3ww35	NjY3MmI1ZmU5MjFiMjllY2Y5NzA2MjM5ZTJhNTlhNjkxMDA2ZGFhZDp7ImF1dGgwX3N0YXRlIjoiTlZITkFieTgySjZ5VVFwWkwwVXFpcHNpRFNLc293dUsiLCJfYXV0aF91c2VyX2lkIjoiOCIsIl9hdXRoX3VzZXJfYmFja2VuZCI6Im15X2F1dGgwLmF1dGgwYmFja2VuZC5BdXRoMCIsIl9hdXRoX3VzZXJfaGFzaCI6ImEzZTdkNjAzMzJjODFjM2ZiNGY1MTE0MWJjNjc5ZTA2YTQ2MjZmNWMiLCJzb2NpYWxfYXV0aF9sYXN0X2xvZ2luX2JhY2tlbmQiOiJhdXRoMCJ9	2019-05-02 00:10:20.148505+00
z2ahjwldwupnlc16syohqhc523haewcb	M2M1YTRmZDQ2YTliN2JiODkwOWM2ZWNlNDg4ZGY2ZjlhZWJmOWFiOTp7ImF1dGgwX3N0YXRlIjoiNktQUWpqRDM4T25QUmp6OWYxV2ZLU1k4NnhRWkJIbEQiLCJfYXV0aF91c2VyX2lkIjoiNiIsIl9hdXRoX3VzZXJfYmFja2VuZCI6Im15X2F1dGgwLmF1dGgwYmFja2VuZC5BdXRoMCIsIl9hdXRoX3VzZXJfaGFzaCI6ImRiZjg1YjQ3MWQ3ODVjZjYwYWE1MTNmYTI2OTg1OTFiMzBjODhjNDciLCJzb2NpYWxfYXV0aF9sYXN0X2xvZ2luX2JhY2tlbmQiOiJhdXRoMCJ9	2019-05-02 14:20:48.352917+00
4nnt8bnpp0g3s3joexsstv5zmpo8o6e1	NTAxZTgyOTgyNjA2NDc0Y2ZhYmE3ZmYwYjk1NGIzNzIwMTUzZGViNTp7ImF1dGgwX3N0YXRlIjoianhTQndPa2FOSXdhRjJOM2JQWmd3eGdoR1NOOG1lMkUiLCJfYXV0aF91c2VyX2lkIjoiOCIsIl9hdXRoX3VzZXJfYmFja2VuZCI6Im15X2F1dGgwLmF1dGgwYmFja2VuZC5BdXRoMCIsIl9hdXRoX3VzZXJfaGFzaCI6ImEzZTdkNjAzMzJjODFjM2ZiNGY1MTE0MWJjNjc5ZTA2YTQ2MjZmNWMiLCJzb2NpYWxfYXV0aF9sYXN0X2xvZ2luX2JhY2tlbmQiOiJhdXRoMCJ9	2019-05-04 19:27:59.489564+00
msctcb0bxwsb9nrphi4wcrz6ri5e8s5j	YzE4ZDJkMTA1NzEwMzUxNGE5Zjg3NDBmZTc4OGI0NDkyOWQ3NmZlNjp7ImF1dGgwX3N0YXRlIjoiVDU3R3hEa1pRT25KQk52b1l6aG5EQ3hBakRaOHZpOW0iLCJfYXV0aF91c2VyX2lkIjoiNyIsIl9hdXRoX3VzZXJfYmFja2VuZCI6Im15X2F1dGgwLmF1dGgwYmFja2VuZC5BdXRoMCIsIl9hdXRoX3VzZXJfaGFzaCI6ImEzNDYxOTZlZDA2MGUxMDJkYjk1MDVjMjJkMTM2YjZlNWNjODhlZDUiLCJzb2NpYWxfYXV0aF9sYXN0X2xvZ2luX2JhY2tlbmQiOiJhdXRoMCJ9	2019-04-30 19:00:55.331813+00
oecvc3vpbr4vlg2kx6n54194mjx8r51l	NGNkMjgyYTYxNjk3MTNiNzY2OGVlMWI5NDBlMjczNTFkMTJhNmEyMTp7Il9hdXRoX3VzZXJfaWQiOiIyIiwiX2F1dGhfdXNlcl9iYWNrZW5kIjoiZGphbmdvLmNvbnRyaWIuYXV0aC5iYWNrZW5kcy5Nb2RlbEJhY2tlbmQiLCJfYXV0aF91c2VyX2hhc2giOiIyYzJjZjhkZDBiYjdhNzFjYzdjMjFlZDQ3MTE5MjY4ODlkZTcxNjdkIn0=	2019-05-01 03:47:04.051295+00
yewl4o5ghq2p4kqv948jql7emhr2t3br	MzNjZGVjNWY2NjEyNWY0ZDE5MjA1YjIyMTA4MWU2ZTQwZWVkMzVjZjp7ImF1dGgwX3N0YXRlIjoiN0dJUXo2QUdCczdBRncxQnJNenQ1T2tjb3F3N0FkMzkifQ==	2019-05-01 06:59:29.614576+00
\.


--
-- Data for Name: exchange_app_account; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_account (id, name, org_id) FROM stdin;
1	AAM a/c 1	AAM
2	Account 1	AAM
\.


--
-- Name: exchange_app_account_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.exchange_app_account_id_seq', 2, true);


--
-- Data for Name: exchange_app_balance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_balance (id, balance, overdraft_limit, account_id, currency_id) FROM stdin;
\.


--
-- Name: exchange_app_balance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.exchange_app_balance_id_seq', 1, false);


--
-- Data for Name: exchange_app_currency; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_currency (abbrev, name) FROM stdin;
BLR	Ballers
\.


--
-- Data for Name: exchange_app_instrument; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_instrument (symbol, name, currency_id, begin_time, expiration, max_price, min_price, owner_id, price_incr, price_mult, price_unit_id, qty_incr, qty_mult, qty_unit_id, type_id) FROM stdin;
IndPakWC19	India to beat Pakistan on 616/2019	BLR	2019-04-18 00:12:43+00	2019-06-16 17:00:00+00	100	0	8	1	1	%Prob	1	1	DFLT	Event
\.


--
-- Data for Name: exchange_app_instrumenttype; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_instrumenttype (abbrev, name) FROM stdin;
Event	One off event
Stock	Equity share
\.


--
-- Data for Name: exchange_app_order; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_order (id, begin_time, expiration, is_buy, quantity, limit_price, filled_quantity, account_id, instrument_id, status_id, trader_id, type_id, max_show_size) FROM stdin;
1	2019-04-20 19:33:51+00	2019-04-20 19:33:51+00	t	100.0000	49.0000	0.0000	1	IndPakWC19	WORKING	7	LMT	10.0
2	2019-04-20 19:36:58+00	2019-04-20 19:36:58+00	f	20.0000	65.0000	0.0000	1	IndPakWC19	WORKING	8	LMT	20.0
3	2019-04-20 19:33:51+00	2019-04-20 19:33:51+00	t	100.0000	40.0000	0.0000	1	IndPakWC19	WORKING	7	LMT	10.0
4	2019-04-20 19:39:52+00	2019-04-20 19:39:52+00	f	40.0000	60.0000	0.0000	1	IndPakWC19	WORKING	8	LMT	40.0
\.


--
-- Name: exchange_app_order_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.exchange_app_order_id_seq', 4, true);


--
-- Data for Name: exchange_app_orderstatus; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_orderstatus (abbrev, name) FROM stdin;
WORKING	Working Order
CANCELED	Canceled Order
KILLED	Killed because Order unsatisfiable
COMPLETED	Completed Order
\.


--
-- Data for Name: exchange_app_ordertype; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_ordertype (abbrev, name) FROM stdin;
LMT	Limit Order
\.


--
-- Data for Name: exchange_app_organization; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_organization (abbrev, name) FROM stdin;
AAM	AdviAdviMurali
\.


--
-- Data for Name: exchange_app_trade; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_trade (id, quantity, price, is_buyer_taker, "timestamp", buyer_id, instrument_id, seller_id) FROM stdin;
\.


--
-- Name: exchange_app_trade_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.exchange_app_trade_id_seq', 1, false);


--
-- Data for Name: exchange_app_trader; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_trader (user_id, org_id) FROM stdin;
7	AAM
8	AAM
\.


--
-- Data for Name: exchange_app_traderpermission; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_traderpermission (id, permission, trader_id, account_id) FROM stdin;
\.


--
-- Name: exchange_app_traderpermission_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.exchange_app_traderpermission_id_seq', 1, false);


--
-- Data for Name: exchange_app_unit; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_app_unit (abbrev, name) FROM stdin;
%Prob	Percent Probability
DFLT	Defalut
\.


--
-- Data for Name: social_auth_association; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.social_auth_association (id, server_url, handle, secret, issued, lifetime, assoc_type) FROM stdin;
\.


--
-- Name: social_auth_association_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.social_auth_association_id_seq', 1, false);


--
-- Data for Name: social_auth_code; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.social_auth_code (id, email, code, verified, "timestamp") FROM stdin;
\.


--
-- Name: social_auth_code_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.social_auth_code_id_seq', 1, false);


--
-- Data for Name: social_auth_nonce; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.social_auth_nonce (id, server_url, "timestamp", salt) FROM stdin;
\.


--
-- Name: social_auth_nonce_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.social_auth_nonce_id_seq', 1, false);


--
-- Data for Name: social_auth_partial; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.social_auth_partial (id, token, next_step, backend, data, "timestamp") FROM stdin;
\.


--
-- Name: social_auth_partial_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.social_auth_partial_id_seq', 1, false);


--
-- Data for Name: social_auth_usersocialauth; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.social_auth_usersocialauth (id, provider, uid, extra_data, user_id) FROM stdin;
6	auth0	facebook|10155266291867403	{"auth_time": 1555441286, "picture": "https://platform-lookaside.fbsbx.com/platform/profilepic/?asid=10155266291867403&height=50&width=50&ext=1558033285&hash=AeQYjr4FAxerM02c", "access_token": "J9-6AuOVncFw-n4aiQT86QITdBrWfk4w", "token_type": "Bearer"}	7
5	auth0	google-oauth2|115168053402255816814	{"auth_time": 1555597248, "picture": "https://lh6.googleusercontent.com/-cAjpkblhmtk/AAAAAAAAAAI/AAAAAAAAHyo/HVm4WDBm2fE/photo.jpg", "access_token": "uZH5L7LpqL4RIa75nP3Yur211Bhm_T-0", "token_type": "Bearer"}	6
7	auth0	google-oauth2|101698623182733660645	{"auth_time": 1555788479, "picture": "https://lh3.googleusercontent.com/-hDrbk6YT70c/AAAAAAAAAAI/AAAAAAAAAAA/ACHi3rflxDiupNAXbP2KIwGIIlNmXHSL5w/mo/photo.jpg", "access_token": "DZixivnOFKZvNZ-0OrgocjICFSywhHx4", "token_type": "Bearer"}	8
\.


--
-- Name: social_auth_usersocialauth_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.social_auth_usersocialauth_id_seq', 7, true);


--
-- Name: event_invocation_logs_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.event_invocation_logs
    ADD CONSTRAINT event_invocation_logs_pkey PRIMARY KEY (id);


--
-- Name: event_log_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.event_log
    ADD CONSTRAINT event_log_pkey PRIMARY KEY (id);


--
-- Name: event_triggers_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.event_triggers
    ADD CONSTRAINT event_triggers_pkey PRIMARY KEY (name);


--
-- Name: hdb_function_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_function
    ADD CONSTRAINT hdb_function_pkey PRIMARY KEY (function_schema, function_name);


--
-- Name: hdb_permission_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_permission
    ADD CONSTRAINT hdb_permission_pkey PRIMARY KEY (table_schema, table_name, role_name, perm_type);


--
-- Name: hdb_query_template_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_query_template
    ADD CONSTRAINT hdb_query_template_pkey PRIMARY KEY (template_name);


--
-- Name: hdb_relationship_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_relationship
    ADD CONSTRAINT hdb_relationship_pkey PRIMARY KEY (table_schema, table_name, rel_name);


--
-- Name: hdb_schema_update_event_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_schema_update_event
    ADD CONSTRAINT hdb_schema_update_event_pkey PRIMARY KEY (id);


--
-- Name: hdb_table_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_table
    ADD CONSTRAINT hdb_table_pkey PRIMARY KEY (table_schema, table_name);


--
-- Name: hdb_version_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_version
    ADD CONSTRAINT hdb_version_pkey PRIMARY KEY (hasura_uuid);


--
-- Name: remote_schemas_name_key; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.remote_schemas
    ADD CONSTRAINT remote_schemas_name_key UNIQUE (name);


--
-- Name: remote_schemas_pkey; Type: CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.remote_schemas
    ADD CONSTRAINT remote_schemas_pkey PRIMARY KEY (id);


--
-- Name: auth_group_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group
    ADD CONSTRAINT auth_group_name_key UNIQUE (name);


--
-- Name: auth_group_permissions_group_id_permission_id_0cd325b0_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_group_id_permission_id_0cd325b0_uniq UNIQUE (group_id, permission_id);


--
-- Name: auth_group_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_pkey PRIMARY KEY (id);


--
-- Name: auth_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group
    ADD CONSTRAINT auth_group_pkey PRIMARY KEY (id);


--
-- Name: auth_permission_content_type_id_codename_01ab375a_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_permission
    ADD CONSTRAINT auth_permission_content_type_id_codename_01ab375a_uniq UNIQUE (content_type_id, codename);


--
-- Name: auth_permission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_permission
    ADD CONSTRAINT auth_permission_pkey PRIMARY KEY (id);


--
-- Name: auth_user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_groups
    ADD CONSTRAINT auth_user_groups_pkey PRIMARY KEY (id);


--
-- Name: auth_user_groups_user_id_group_id_94350c0c_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_groups
    ADD CONSTRAINT auth_user_groups_user_id_group_id_94350c0c_uniq UNIQUE (user_id, group_id);


--
-- Name: auth_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_pkey PRIMARY KEY (id);


--
-- Name: auth_user_user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permissions_pkey PRIMARY KEY (id);


--
-- Name: auth_user_user_permissions_user_id_permission_id_14a6b632_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permissions_user_id_permission_id_14a6b632_uniq UNIQUE (user_id, permission_id);


--
-- Name: auth_user_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_username_key UNIQUE (username);


--
-- Name: chat_room_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room
    ADD CONSTRAINT chat_room_pkey PRIMARY KEY (id);


--
-- Name: django_admin_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_admin_log
    ADD CONSTRAINT django_admin_log_pkey PRIMARY KEY (id);


--
-- Name: django_content_type_app_label_model_76bd3d3b_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_content_type
    ADD CONSTRAINT django_content_type_app_label_model_76bd3d3b_uniq UNIQUE (app_label, model);


--
-- Name: django_content_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_content_type
    ADD CONSTRAINT django_content_type_pkey PRIMARY KEY (id);


--
-- Name: django_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_migrations
    ADD CONSTRAINT django_migrations_pkey PRIMARY KEY (id);


--
-- Name: django_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_session
    ADD CONSTRAINT django_session_pkey PRIMARY KEY (session_key);


--
-- Name: exchange_app_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_account
    ADD CONSTRAINT exchange_app_account_pkey PRIMARY KEY (id);


--
-- Name: exchange_app_balance_account_id_currency_id_c2edbb06_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_balance
    ADD CONSTRAINT exchange_app_balance_account_id_currency_id_c2edbb06_uniq UNIQUE (account_id, currency_id);


--
-- Name: exchange_app_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_balance
    ADD CONSTRAINT exchange_app_balance_pkey PRIMARY KEY (id);


--
-- Name: exchange_app_currency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_currency
    ADD CONSTRAINT exchange_app_currency_pkey PRIMARY KEY (abbrev);


--
-- Name: exchange_app_instrument_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_instrument
    ADD CONSTRAINT exchange_app_instrument_pkey PRIMARY KEY (symbol);


--
-- Name: exchange_app_instrumenttype_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_instrumenttype
    ADD CONSTRAINT exchange_app_instrumenttype_pkey PRIMARY KEY (abbrev);


--
-- Name: exchange_app_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_order
    ADD CONSTRAINT exchange_app_order_pkey PRIMARY KEY (id);


--
-- Name: exchange_app_orderstatus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_orderstatus
    ADD CONSTRAINT exchange_app_orderstatus_pkey PRIMARY KEY (abbrev);


--
-- Name: exchange_app_ordertype_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_ordertype
    ADD CONSTRAINT exchange_app_ordertype_pkey PRIMARY KEY (abbrev);


--
-- Name: exchange_app_organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_organization
    ADD CONSTRAINT exchange_app_organization_pkey PRIMARY KEY (abbrev);


--
-- Name: exchange_app_trade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_trade
    ADD CONSTRAINT exchange_app_trade_pkey PRIMARY KEY (id);


--
-- Name: exchange_app_trader_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_trader
    ADD CONSTRAINT exchange_app_trader_pkey PRIMARY KEY (user_id);


--
-- Name: exchange_app_traderpermission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_traderpermission
    ADD CONSTRAINT exchange_app_traderpermission_pkey PRIMARY KEY (id);


--
-- Name: exchange_app_unit_abbrev_5afc465f_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_unit
    ADD CONSTRAINT exchange_app_unit_abbrev_5afc465f_pk PRIMARY KEY (abbrev);


--
-- Name: social_auth_association_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_association
    ADD CONSTRAINT social_auth_association_pkey PRIMARY KEY (id);


--
-- Name: social_auth_association_server_url_handle_078befa2_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_association
    ADD CONSTRAINT social_auth_association_server_url_handle_078befa2_uniq UNIQUE (server_url, handle);


--
-- Name: social_auth_code_email_code_801b2d02_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_code
    ADD CONSTRAINT social_auth_code_email_code_801b2d02_uniq UNIQUE (email, code);


--
-- Name: social_auth_code_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_code
    ADD CONSTRAINT social_auth_code_pkey PRIMARY KEY (id);


--
-- Name: social_auth_nonce_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_nonce
    ADD CONSTRAINT social_auth_nonce_pkey PRIMARY KEY (id);


--
-- Name: social_auth_nonce_server_url_timestamp_salt_f6284463_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_nonce
    ADD CONSTRAINT social_auth_nonce_server_url_timestamp_salt_f6284463_uniq UNIQUE (server_url, "timestamp", salt);


--
-- Name: social_auth_partial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_partial
    ADD CONSTRAINT social_auth_partial_pkey PRIMARY KEY (id);


--
-- Name: social_auth_usersocialauth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_usersocialauth
    ADD CONSTRAINT social_auth_usersocialauth_pkey PRIMARY KEY (id);


--
-- Name: social_auth_usersocialauth_provider_uid_e6b5e668_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_usersocialauth
    ADD CONSTRAINT social_auth_usersocialauth_provider_uid_e6b5e668_uniq UNIQUE (provider, uid);


--
-- Name: event_invocation_logs_event_id_idx; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE INDEX event_invocation_logs_event_id_idx ON hdb_catalog.event_invocation_logs USING btree (event_id);


--
-- Name: event_log_trigger_name_idx; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE INDEX event_log_trigger_name_idx ON hdb_catalog.event_log USING btree (trigger_name);


--
-- Name: hdb_version_one_row; Type: INDEX; Schema: hdb_catalog; Owner: -
--

CREATE UNIQUE INDEX hdb_version_one_row ON hdb_catalog.hdb_version USING btree (((version IS NOT NULL)));


--
-- Name: auth_group_name_a6ea08ec_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_group_name_a6ea08ec_like ON public.auth_group USING btree (name varchar_pattern_ops);


--
-- Name: auth_group_permissions_group_id_b120cbf9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_group_permissions_group_id_b120cbf9 ON public.auth_group_permissions USING btree (group_id);


--
-- Name: auth_group_permissions_permission_id_84c5c92e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_group_permissions_permission_id_84c5c92e ON public.auth_group_permissions USING btree (permission_id);


--
-- Name: auth_permission_content_type_id_2f476e4b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_permission_content_type_id_2f476e4b ON public.auth_permission USING btree (content_type_id);


--
-- Name: auth_user_groups_group_id_97559544; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_user_groups_group_id_97559544 ON public.auth_user_groups USING btree (group_id);


--
-- Name: auth_user_groups_user_id_6a12ed8b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_user_groups_user_id_6a12ed8b ON public.auth_user_groups USING btree (user_id);


--
-- Name: auth_user_user_permissions_permission_id_1fbb5f2c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_user_user_permissions_permission_id_1fbb5f2c ON public.auth_user_user_permissions USING btree (permission_id);


--
-- Name: auth_user_user_permissions_user_id_a95ead1b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_user_user_permissions_user_id_a95ead1b ON public.auth_user_user_permissions USING btree (user_id);


--
-- Name: auth_user_username_6821ab7c_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_user_username_6821ab7c_like ON public.auth_user USING btree (username varchar_pattern_ops);


--
-- Name: django_admin_log_content_type_id_c4bce8eb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_admin_log_content_type_id_c4bce8eb ON public.django_admin_log USING btree (content_type_id);


--
-- Name: django_admin_log_user_id_c564eba6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_admin_log_user_id_c564eba6 ON public.django_admin_log USING btree (user_id);


--
-- Name: django_session_expire_date_a5c62663; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_session_expire_date_a5c62663 ON public.django_session USING btree (expire_date);


--
-- Name: django_session_session_key_c0390e0f_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_session_session_key_c0390e0f_like ON public.django_session USING btree (session_key varchar_pattern_ops);


--
-- Name: exchange_app_account_org_id_5671f737; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_account_org_id_5671f737 ON public.exchange_app_account USING btree (org_id);


--
-- Name: exchange_app_account_org_id_5671f737_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_account_org_id_5671f737_like ON public.exchange_app_account USING btree (org_id varchar_pattern_ops);


--
-- Name: exchange_app_balance_account_id_eae1089d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_balance_account_id_eae1089d ON public.exchange_app_balance USING btree (account_id);


--
-- Name: exchange_app_balance_currency_id_58f97786; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_balance_currency_id_58f97786 ON public.exchange_app_balance USING btree (currency_id);


--
-- Name: exchange_app_balance_currency_id_58f97786_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_balance_currency_id_58f97786_like ON public.exchange_app_balance USING btree (currency_id varchar_pattern_ops);


--
-- Name: exchange_app_currency_abbrev_b629ac85_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_currency_abbrev_b629ac85_like ON public.exchange_app_currency USING btree (abbrev varchar_pattern_ops);


--
-- Name: exchange_app_instrument_currency_id_fd01f9ca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrument_currency_id_fd01f9ca ON public.exchange_app_instrument USING btree (currency_id);


--
-- Name: exchange_app_instrument_currency_id_fd01f9ca_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrument_currency_id_fd01f9ca_like ON public.exchange_app_instrument USING btree (currency_id varchar_pattern_ops);


--
-- Name: exchange_app_instrument_owner_id_fe53ce6b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrument_owner_id_fe53ce6b ON public.exchange_app_instrument USING btree (owner_id);


--
-- Name: exchange_app_instrument_price_unit_id_1313a74e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrument_price_unit_id_1313a74e ON public.exchange_app_instrument USING btree (price_unit_id);


--
-- Name: exchange_app_instrument_price_unit_id_1313a74e_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrument_price_unit_id_1313a74e_like ON public.exchange_app_instrument USING btree (price_unit_id varchar_pattern_ops);


--
-- Name: exchange_app_instrument_qty_unit_id_79ef1237; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrument_qty_unit_id_79ef1237 ON public.exchange_app_instrument USING btree (qty_unit_id);


--
-- Name: exchange_app_instrument_qty_unit_id_79ef1237_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrument_qty_unit_id_79ef1237_like ON public.exchange_app_instrument USING btree (qty_unit_id varchar_pattern_ops);


--
-- Name: exchange_app_instrument_symbol_dc2967dc_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrument_symbol_dc2967dc_like ON public.exchange_app_instrument USING btree (symbol varchar_pattern_ops);


--
-- Name: exchange_app_instrument_type_id_9b2030f2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrument_type_id_9b2030f2 ON public.exchange_app_instrument USING btree (type_id);


--
-- Name: exchange_app_instrument_type_id_9b2030f2_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrument_type_id_9b2030f2_like ON public.exchange_app_instrument USING btree (type_id varchar_pattern_ops);


--
-- Name: exchange_app_instrumenttype_abbrev_207a995f_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_instrumenttype_abbrev_207a995f_like ON public.exchange_app_instrumenttype USING btree (abbrev varchar_pattern_ops);


--
-- Name: exchange_app_order_account_id_893f0c3c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_order_account_id_893f0c3c ON public.exchange_app_order USING btree (account_id);


--
-- Name: exchange_app_order_instrument_id_452044f5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_order_instrument_id_452044f5 ON public.exchange_app_order USING btree (instrument_id);


--
-- Name: exchange_app_order_instrument_id_452044f5_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_order_instrument_id_452044f5_like ON public.exchange_app_order USING btree (instrument_id varchar_pattern_ops);


--
-- Name: exchange_app_order_status_id_db496c8d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_order_status_id_db496c8d ON public.exchange_app_order USING btree (status_id);


--
-- Name: exchange_app_order_status_id_db496c8d_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_order_status_id_db496c8d_like ON public.exchange_app_order USING btree (status_id varchar_pattern_ops);


--
-- Name: exchange_app_order_trader_id_df15e722; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_order_trader_id_df15e722 ON public.exchange_app_order USING btree (trader_id);


--
-- Name: exchange_app_order_type_id_585b3218; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_order_type_id_585b3218 ON public.exchange_app_order USING btree (type_id);


--
-- Name: exchange_app_order_type_id_585b3218_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_order_type_id_585b3218_like ON public.exchange_app_order USING btree (type_id varchar_pattern_ops);


--
-- Name: exchange_app_orderstatus_abbrev_2ad9be74_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_orderstatus_abbrev_2ad9be74_like ON public.exchange_app_orderstatus USING btree (abbrev varchar_pattern_ops);


--
-- Name: exchange_app_ordertype_abbrev_c322b9a4_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_ordertype_abbrev_c322b9a4_like ON public.exchange_app_ordertype USING btree (abbrev varchar_pattern_ops);


--
-- Name: exchange_app_organization_abbrev_04acb593_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_organization_abbrev_04acb593_like ON public.exchange_app_organization USING btree (abbrev varchar_pattern_ops);


--
-- Name: exchange_app_trade_buyer_id_25c0e9f1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_trade_buyer_id_25c0e9f1 ON public.exchange_app_trade USING btree (buyer_id);


--
-- Name: exchange_app_trade_instrument_id_6073bbbc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_trade_instrument_id_6073bbbc ON public.exchange_app_trade USING btree (instrument_id);


--
-- Name: exchange_app_trade_instrument_id_6073bbbc_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_trade_instrument_id_6073bbbc_like ON public.exchange_app_trade USING btree (instrument_id varchar_pattern_ops);


--
-- Name: exchange_app_trade_seller_id_965237b9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_trade_seller_id_965237b9 ON public.exchange_app_trade USING btree (seller_id);


--
-- Name: exchange_app_trader_org_id_f633e3cc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_trader_org_id_f633e3cc ON public.exchange_app_trader USING btree (org_id);


--
-- Name: exchange_app_trader_org_id_f633e3cc_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_trader_org_id_f633e3cc_like ON public.exchange_app_trader USING btree (org_id varchar_pattern_ops);


--
-- Name: exchange_app_traderpermission_account_id_3c139aae; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_traderpermission_account_id_3c139aae ON public.exchange_app_traderpermission USING btree (account_id);


--
-- Name: exchange_app_traderpermission_trader_id_0f6c5628; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_traderpermission_trader_id_0f6c5628 ON public.exchange_app_traderpermission USING btree (trader_id);


--
-- Name: exchange_app_unit_abbrev_5afc465f_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_app_unit_abbrev_5afc465f_like ON public.exchange_app_unit USING btree (abbrev varchar_pattern_ops);


--
-- Name: social_auth_code_code_a2393167; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_auth_code_code_a2393167 ON public.social_auth_code USING btree (code);


--
-- Name: social_auth_code_code_a2393167_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_auth_code_code_a2393167_like ON public.social_auth_code USING btree (code varchar_pattern_ops);


--
-- Name: social_auth_code_timestamp_176b341f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_auth_code_timestamp_176b341f ON public.social_auth_code USING btree ("timestamp");


--
-- Name: social_auth_partial_timestamp_50f2119f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_auth_partial_timestamp_50f2119f ON public.social_auth_partial USING btree ("timestamp");


--
-- Name: social_auth_partial_token_3017fea3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_auth_partial_token_3017fea3 ON public.social_auth_partial USING btree (token);


--
-- Name: social_auth_partial_token_3017fea3_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_auth_partial_token_3017fea3_like ON public.social_auth_partial USING btree (token varchar_pattern_ops);


--
-- Name: social_auth_usersocialauth_user_id_17d28448; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_auth_usersocialauth_user_id_17d28448 ON public.social_auth_usersocialauth USING btree (user_id);


--
-- Name: hdb_schema_update_event_notifier; Type: TRIGGER; Schema: hdb_catalog; Owner: -
--

CREATE TRIGGER hdb_schema_update_event_notifier AFTER INSERT ON hdb_catalog.hdb_schema_update_event FOR EACH ROW EXECUTE PROCEDURE hdb_catalog.hdb_schema_update_event_notifier();


--
-- Name: hdb_table_oid_check; Type: TRIGGER; Schema: hdb_catalog; Owner: -
--

CREATE TRIGGER hdb_table_oid_check BEFORE INSERT OR UPDATE ON hdb_catalog.hdb_table FOR EACH ROW EXECUTE PROCEDURE hdb_catalog.hdb_table_oid_check();


--
-- Name: event_invocation_logs_event_id_fkey; Type: FK CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.event_invocation_logs
    ADD CONSTRAINT event_invocation_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES hdb_catalog.event_log(id);


--
-- Name: event_triggers_schema_name_fkey; Type: FK CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.event_triggers
    ADD CONSTRAINT event_triggers_schema_name_fkey FOREIGN KEY (schema_name, table_name) REFERENCES hdb_catalog.hdb_table(table_schema, table_name) ON UPDATE CASCADE;


--
-- Name: hdb_permission_table_schema_fkey; Type: FK CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_permission
    ADD CONSTRAINT hdb_permission_table_schema_fkey FOREIGN KEY (table_schema, table_name) REFERENCES hdb_catalog.hdb_table(table_schema, table_name) ON UPDATE CASCADE;


--
-- Name: hdb_relationship_table_schema_fkey; Type: FK CONSTRAINT; Schema: hdb_catalog; Owner: -
--

ALTER TABLE ONLY hdb_catalog.hdb_relationship
    ADD CONSTRAINT hdb_relationship_table_schema_fkey FOREIGN KEY (table_schema, table_name) REFERENCES hdb_catalog.hdb_table(table_schema, table_name) ON UPDATE CASCADE;


--
-- Name: auth_group_permissio_permission_id_84c5c92e_fk_auth_perm; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissio_permission_id_84c5c92e_fk_auth_perm FOREIGN KEY (permission_id) REFERENCES public.auth_permission(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_group_permissions_group_id_b120cbf9_fk_auth_group_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_group_id_b120cbf9_fk_auth_group_id FOREIGN KEY (group_id) REFERENCES public.auth_group(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_permission_content_type_id_2f476e4b_fk_django_co; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_permission
    ADD CONSTRAINT auth_permission_content_type_id_2f476e4b_fk_django_co FOREIGN KEY (content_type_id) REFERENCES public.django_content_type(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_groups_group_id_97559544_fk_auth_group_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_groups
    ADD CONSTRAINT auth_user_groups_group_id_97559544_fk_auth_group_id FOREIGN KEY (group_id) REFERENCES public.auth_group(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_groups_user_id_6a12ed8b_fk_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_groups
    ADD CONSTRAINT auth_user_groups_user_id_6a12ed8b_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES public.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm FOREIGN KEY (permission_id) REFERENCES public.auth_permission(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES public.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: django_admin_log_content_type_id_c4bce8eb_fk_django_co; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_admin_log
    ADD CONSTRAINT django_admin_log_content_type_id_c4bce8eb_fk_django_co FOREIGN KEY (content_type_id) REFERENCES public.django_content_type(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: django_admin_log_user_id_c564eba6_fk_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_admin_log
    ADD CONSTRAINT django_admin_log_user_id_c564eba6_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES public.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_account_org_id_5671f737_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_account
    ADD CONSTRAINT exchange_app_account_org_id_5671f737_fk_exchange_ FOREIGN KEY (org_id) REFERENCES public.exchange_app_organization(abbrev) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_balance_account_id_eae1089d_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_balance
    ADD CONSTRAINT exchange_app_balance_account_id_eae1089d_fk_exchange_ FOREIGN KEY (account_id) REFERENCES public.exchange_app_account(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_balance_currency_id_58f97786_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_balance
    ADD CONSTRAINT exchange_app_balance_currency_id_58f97786_fk_exchange_ FOREIGN KEY (currency_id) REFERENCES public.exchange_app_currency(abbrev) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_instrum_currency_id_fd01f9ca_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_instrument
    ADD CONSTRAINT exchange_app_instrum_currency_id_fd01f9ca_fk_exchange_ FOREIGN KEY (currency_id) REFERENCES public.exchange_app_currency(abbrev) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_instrum_price_unit_id_1313a74e_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_instrument
    ADD CONSTRAINT exchange_app_instrum_price_unit_id_1313a74e_fk_exchange_ FOREIGN KEY (price_unit_id) REFERENCES public.exchange_app_unit(abbrev) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_instrum_qty_unit_id_79ef1237_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_instrument
    ADD CONSTRAINT exchange_app_instrum_qty_unit_id_79ef1237_fk_exchange_ FOREIGN KEY (qty_unit_id) REFERENCES public.exchange_app_unit(abbrev) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_instrum_type_id_9b2030f2_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_instrument
    ADD CONSTRAINT exchange_app_instrum_type_id_9b2030f2_fk_exchange_ FOREIGN KEY (type_id) REFERENCES public.exchange_app_instrumenttype(abbrev) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_instrument_owner_id_fe53ce6b_fk_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_instrument
    ADD CONSTRAINT exchange_app_instrument_owner_id_fe53ce6b_fk_auth_user_id FOREIGN KEY (owner_id) REFERENCES public.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_order_account_id_893f0c3c_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_order
    ADD CONSTRAINT exchange_app_order_account_id_893f0c3c_fk_exchange_ FOREIGN KEY (account_id) REFERENCES public.exchange_app_account(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_order_instrument_id_452044f5_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_order
    ADD CONSTRAINT exchange_app_order_instrument_id_452044f5_fk_exchange_ FOREIGN KEY (instrument_id) REFERENCES public.exchange_app_instrument(symbol) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_order_status_id_db496c8d_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_order
    ADD CONSTRAINT exchange_app_order_status_id_db496c8d_fk_exchange_ FOREIGN KEY (status_id) REFERENCES public.exchange_app_orderstatus(abbrev) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_order_trader_id_df15e722_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_order
    ADD CONSTRAINT exchange_app_order_trader_id_df15e722_fk_exchange_ FOREIGN KEY (trader_id) REFERENCES public.exchange_app_trader(user_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_order_type_id_585b3218_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_order
    ADD CONSTRAINT exchange_app_order_type_id_585b3218_fk_exchange_ FOREIGN KEY (type_id) REFERENCES public.exchange_app_ordertype(abbrev) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_trade_buyer_id_25c0e9f1_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_trade
    ADD CONSTRAINT exchange_app_trade_buyer_id_25c0e9f1_fk_exchange_ FOREIGN KEY (buyer_id) REFERENCES public.exchange_app_trader(user_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_trade_instrument_id_6073bbbc_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_trade
    ADD CONSTRAINT exchange_app_trade_instrument_id_6073bbbc_fk_exchange_ FOREIGN KEY (instrument_id) REFERENCES public.exchange_app_instrument(symbol) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_trade_seller_id_965237b9_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_trade
    ADD CONSTRAINT exchange_app_trade_seller_id_965237b9_fk_exchange_ FOREIGN KEY (seller_id) REFERENCES public.exchange_app_trader(user_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_trader_org_id_f633e3cc_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_trader
    ADD CONSTRAINT exchange_app_trader_org_id_f633e3cc_fk_exchange_ FOREIGN KEY (org_id) REFERENCES public.exchange_app_organization(abbrev) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_trader_user_id_a980b17c_fk_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_trader
    ADD CONSTRAINT exchange_app_trader_user_id_a980b17c_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES public.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_traderp_account_id_3c139aae_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_traderpermission
    ADD CONSTRAINT exchange_app_traderp_account_id_3c139aae_fk_exchange_ FOREIGN KEY (account_id) REFERENCES public.exchange_app_account(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: exchange_app_traderp_trader_id_0f6c5628_fk_exchange_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_app_traderpermission
    ADD CONSTRAINT exchange_app_traderp_trader_id_0f6c5628_fk_exchange_ FOREIGN KEY (trader_id) REFERENCES public.exchange_app_trader(user_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: social_auth_usersocialauth_user_id_17d28448_fk_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_auth_usersocialauth
    ADD CONSTRAINT social_auth_usersocialauth_user_id_17d28448_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES public.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM postgres;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

