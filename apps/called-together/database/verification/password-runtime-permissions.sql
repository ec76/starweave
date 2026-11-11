-- OWNER REVIEW TEMPLATE ONLY. The coding agent does not execute grants.
-- Replace BOTH placeholders with the explicitly selected target and existing user.
IF DB_NAME() <> N'REPLACE_DATABASE' THROW 53230,'Select the reviewed database.',1;
DECLARE @RuntimePrincipal sysname=N'REPLACE_RUNTIME_USER';
IF @RuntimePrincipal=N'REPLACE_RUNTIME_USER' OR DATABASE_PRINCIPAL_ID(@RuntimePrincipal) IS NULL THROW 53230,'Select an existing runtime principal.',1;
IF IS_ROLEMEMBER(N'db_owner',@RuntimePrincipal)=1 OR IS_ROLEMEMBER(N'db_ddladmin',@RuntimePrincipal)=1 OR IS_ROLEMEMBER(N'db_securityadmin',@RuntimePrincipal)=1
 THROW 53230,'Privileged principals cannot be restricted by this template.',1;
DECLARE @principal nvarchar(258)=QUOTENAME(@RuntimePrincipal),@sql nvarchar(max)=N'';
SELECT @sql=@sql+N'GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.'+QUOTENAME(name)+N' TO '+@principal+N';'
 FROM (VALUES(N'AuthUsers'),(N'AuthSessions'),(N'AuthAccounts'),(N'AuthVerifications'),(N'AuthSetupVerifications')) tables(name);
SELECT @sql=@sql+N'GRANT SELECT ON OBJECT::dbo.'+QUOTENAME(name)+N' TO '+@principal+N'; DENY INSERT, UPDATE, DELETE ON OBJECT::dbo.'+QUOTENAME(name)+N' TO '+@principal+N';'
 FROM (VALUES(N'AuthRoleAssignments'),(N'AuthInvitations')) tables(name);
SELECT @sql=@sql+N'DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.'+QUOTENAME(name)+N' TO '+@principal+N';'
 FROM (VALUES(N'ActivityEvents'),(N'AuthAuditEvents'),(N'AuthSecurityBuckets'),(N'AuthThrottleBuckets')) tables(name);
SET @sql=@sql+N'GRANT SELECT, UPDATE ON OBJECT::dbo.AuthNotifications TO '+@principal+N'; DENY INSERT, DELETE ON OBJECT::dbo.AuthNotifications TO '+@principal+N';';
SELECT @sql=@sql+N'GRANT EXECUTE ON OBJECT::dbo.'+QUOTENAME(name)+N' TO '+@principal+N';'
 FROM (VALUES(N'AuthManageAccount'),(N'AuthThrottle'),(N'AuthBeginSession'),(N'AuthRecordSessionEvent'),(N'AuthCompletePassword'),(N'AuthSecurityEvent'),(N'AuthListActivity')) procedures(name);
SET @sql=@sql+N'DENY EXECUTE ON OBJECT::dbo.AuthBootstrapAdministrator TO '+@principal+N'; DENY EXECUTE ON OBJECT::dbo.AuthRecoverPending TO '+@principal+N';';
EXEC sys.sp_executesql @sql;
-- No schema/database blanket grants, ALTER rights, bootstrap or resource changes.
-- Audit SELECT/INSERT happen through the same-owner procedures, including with
-- the explicit direct-table DENYs above. Test using the ACTUAL runtime identity.
