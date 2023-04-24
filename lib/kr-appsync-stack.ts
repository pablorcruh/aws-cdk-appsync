import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { readFileSync } from "fs";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import {
  CfnGraphQLApi,
  CfnGraphQLSchema,
  CfnDataSource,
  CfnResolver,
} from "aws-cdk-lib/aws-appsync";
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice'
import { Unit } from 'aws-cdk-lib/aws-cloudwatch';
import * as rds from 'aws-cdk-lib/aws-rds';
import { DatabaseInstance, DatabaseInstanceProps, DatabaseCluster, IDatabaseInstance } from 'aws-cdk-lib/aws-rds';
import {CodePipeline, CodePipelineSource, ShellStep} from 'aws-cdk-lib/pipelines'


export class KrAppsyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
       

    /* const openSearchDomain = 'https://search-bitmap-solutions-4yi3533owyvxnzjky3zet5h5au.us-east-1.es.amazonaws.com';
    const myExistingDomain = opensearch.Domain.fromDomainEndpoint(
      this, 'myExistingDomain', openSearchDomain);  */

      const existingDbClusterArn = 'arn:aws:rds:us-east-1:123456789012:cluster:my-db-cluster';
      const existingClusterInstance = rds.DatabaseCluster.fromDatabaseClusterAttributes(this, 'ExistingDBCluster', {
        clusterIdentifier: existingDbClusterArn
      });
      

      const auroraDbInstanceId = 'my-aurora-instance';

// Create a DatabaseInstance construct to reference the existing Aurora DB instance

const dbInstanceIdentifier = 'my-rds-instance';
const instanceEndpointAddress = 'my-rds-instance-xyz12345.us-east-1.rds.amazonaws.com';
const instancePort = 5432;
const dbInstance = rds.DatabaseInstance.fromDatabaseInstanceAttributes(this, 'DbInstance', {
  instanceIdentifier: dbInstanceIdentifier,
  instanceEndpointAddress: instanceEndpointAddress,
  securityGroups: [],
  port: instancePort
});


    const reCaptchaApiUrl = 'https://www.google.com/recaptcha/api/siteverify';
    
    const cloudWatchRole = new Role(this, "appSyncCloudWatchLogs", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });

    cloudWatchRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSAppSyncPushToCloudWatchLogs"
      )
    );

    const dynamoDBRole = new Role(this, "DynamoDBRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });

    const recaptchaRole = new iam.Role(this, 'RecaptchaRole', {
      roleName: 'recaptcha-role', // Replace with your desired role name
      assumedBy: new iam.ServicePrincipal('appsync.amazonaws.com'), // Assume role by AppSync service
    });

    const appsyncAuroraRole = new iam.Role(this, 'AppSyncAuroraRole', {
      roleName: 'AppSyncAuroraRole',
      assumedBy: new iam.ServicePrincipal('rds.amazonaws.com'), // The assumed entity is the AppSync service
    });

    appsyncAuroraRole.attachInlinePolicy(new iam.Policy(this, 'AuroraDBPolicy',{
      statements: [
        new iam.PolicyStatement({
          actions:[
            'rds:CreateDBCluster',
            'rds:DescribeDBClusters'
          ],
          resources: ['*']
        })
      ]
    }))



/*     appsyncAuroraRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rds-data:ExecuteStatement', // Permission to execute SQL statements on Aurora DB
        'secretsmanager:GetSecretValue', // Permission to access the AWS Secrets Manager secret containing the Aurora DB credentials
      ],
      resources: [
        'arn:aws:rds:<region>:<account-id>:cluster:<cluster-identifier>', // Replace with the ARN of your Aurora DB cluster
        'arn:aws:secretsmanager:<region>:<account-id>:secret:<secret-id>', // Replace with the ARN of your AWS Secrets Manager secret
      ],
    }));
 */    

    const recaptchaPolicy = new iam.Policy(this, 'RecaptchaPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['execute-api:Invoke'],
          effect: iam.Effect.ALLOW,
          resources: ['arn:aws:execute-api:*:*:*/*/POST/https://www.google.com/recaptcha/api/siteverify'], // ReCAPTCHA API endpoint
        }),
      ],
    });

    // Attach the inline policy to the RecaptchaRole
    recaptchaRole.attachInlinePolicy(recaptchaPolicy);


   /* const openSearchRole = new Role(this, "OpenSearchDataSourceRole",{
      inlinePolicies: {
        'openSearchPolicy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'es:ESHttpGet',
                'es:ESHttpHead',
              ],
              resources: [
                'arn:aws:es:us-east-1:634522811166:domain/bitmap-solutions',
              ],
            }),
          ],
        })
      },
      assumedBy: new ServicePrincipal("appsync.amazonaws.com")
    }) */

    dynamoDBRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
    );



    const graphAPI = new CfnGraphQLApi(this, "graphqlApi", {
      name: "kr-reports-appsync",
      authenticationType: "API_KEY",
      
      logConfig: {
        fieldLogLevel: "ALL",
        cloudWatchLogsRoleArn: cloudWatchRole.roleArn,
      },
      xrayEnabled: false,
    });

    const apiSchema = new CfnGraphQLSchema(this, "GraphqlApiSchema", {
      apiId: graphAPI.attrApiId,
      definition: readFileSync("./lib/graphql/schema.graphql").toString(),
    });

    const summary = Table.fromTableName(this,'KrAgentCountersResume', 'kr-agents-counters-resume');
    const domainTable = Table.fromTableName(this,'KrDomainTable', 'kr-domain-table');
    

    /* const openSearchDataSource = new appsync.CfnDataSource(this, 'OpenSearchDataSource', {
      apiId: graphAPI.attrApiId,
      name: 'OpenSearchDataSource',
      type: 'AMAZON_ELASTICSEARCH',
      elasticsearchConfig: {
        awsRegion: myExistingDomain.env.region,
        endpoint: openSearchDomain
      },
      serviceRoleArn: openSearchRole.roleArn
    }); */



    const summaryTableDatasource: CfnDataSource = new CfnDataSource(
      this,
      "summaryTableDatasource",
      {
        apiId: graphAPI.attrApiId,
        name: "summaryTableDatasource",
        type: "AMAZON_DYNAMODB",
        dynamoDbConfig: {
          tableName: summary.tableName,
          awsRegion: this.region,
        },
        serviceRoleArn: dynamoDBRole.roleArn,
      }
    );

    const auroraDataSource = new CfnDataSource(this, 'AuroraDBDataSource', {
      apiId: graphAPI.attrApiId,
      name: 'auroraDataSource',
      type: 'RELATIONAL_DATABASE',
      relationalDatabaseConfig: {
        relationalDatabaseSourceType: 'RDS_HTTP_ENDPOINT',
        rdsHttpEndpointConfig: {
          awsRegion: this.region,
          awsSecretStoreArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-db-secret',
          dbClusterIdentifier: existingDbClusterArn,
          databaseName: 'databaseName'
        }
      },
      serviceRoleArn: appsyncAuroraRole.roleArn
    });

  
    const domainTableDatasource: CfnDataSource = new CfnDataSource(
      this,
      "domainTableDatasource",
      {
        apiId: graphAPI.attrApiId,
        name: "domainTableDatasource",
        type: "AMAZON_DYNAMODB",
        dynamoDbConfig: {
          tableName: domainTable.tableName,
          awsRegion: this.region,
        },
        serviceRoleArn: dynamoDBRole.roleArn,
      }
    );

    const reCaptchaDataSource: CfnDataSource = new CfnDataSource(
      this,
      "reCaptchaDataSource",
      {
        apiId: graphAPI.attrApiId,
        name: "reCaptchaDataSource",
        type: "HTTP",
        httpConfig: {
          endpoint: 'https://www.google.com/recaptcha/api/siteverify'
        }
      }
    );

    


    /* const indicatorPerAreaResolver: CfnResolver = new CfnResolver(
      this,
      "indicatorPerAreaResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Query",
        fieldName: "getIndicatorPerArea",
        dataSourceName: openSearchDataSource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.indicatorPerArea.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.indicatorPerArea.res.vtl"
        ).toString(),
      }
    ); */
   


  
    const classificationSummaryResolver: CfnResolver = new CfnResolver(
      this,
      "classificationSummaryResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Query",
        fieldName: "getClassificationSummary",
        dataSourceName: summaryTableDatasource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.classificationSummary.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.classificationSummary.res.vtl"
        ).toString(),
      }
    );

     const recaptchaValidationResolver: CfnResolver = new CfnResolver(
      this,
      "recaptchaValidationResolver",
      {
        
        apiId: graphAPI.attrApiId,
        typeName: "Mutation",
        fieldName: "validateRecaptcha",
        dataSourceName: reCaptchaDataSource.name,
        requestMappingTemplate: readFileSync(
          "./lib/http/mappingTemplates/Invoke.recaptchaValidator.req.vtl"
        ).toString(),
        responseMappingTemplate: readFileSync(
          "./lib/http/mappingTemplates/Invoke.recaptchaValidator.res.vtl"
        ).toString()
      }, 
    );


    recaptchaValidationResolver.addDependsOn(apiSchema)

    classificationSummaryResolver.addDependsOn(apiSchema);
    
    //indicatorPerAreaResolver.addDependsOn(openSearchDataSource);
   
  }




}
