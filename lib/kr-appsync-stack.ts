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
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice'
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';


export class KrAppsyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const getSecretManagerInstance = secretsmanager.Secret.fromSecretNameV2(
      this,
      'cdk-reports',
      '/cdk-reports/aws/appsync/develop',
    );
         
    const recaptchaValue = getSecretManagerInstance.secretValueFromJson('recaptcha_secret').toString()

    const bucket_name = this.node.tryGetContext('recaptcha_private_key');

    let domainsTable = dynamodb.Table.fromTableName(this, 'MyTable', 'krDomainsTable');

if (domainsTable.tableName == null) {
  domainsTable = new dynamodb.Table(this, 'krDomainsTable', {
    partitionKey: {
      name: 'domain_name',
      type: dynamodb.AttributeType.STRING,
    },
    sortKey: {
      name: 'enterprise_id',
      type: dynamodb.AttributeType.STRING,
    },
    tableName: 'krDomainsTable',
    billingMode: dynamodb.BillingMode.PROVISIONED,
    readCapacity: 1,
    writeCapacity: 1,
    removalPolicy: cdk.RemovalPolicy.RETAIN,
  });
}

       
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
      assumedBy: new iam.ServicePrincipal('appsync.amazonaws.com'), // The assumed entity is the AppSync service
    });

    appsyncAuroraRole.attachInlinePolicy(new iam.Policy(this, 'AuroraDBPolicy',{
      statements: [
        new iam.PolicyStatement({
          actions: [
            'sts:AssumeRole', 
            'rds-db:connect',
            'rds-data:ExecuteStatement',
            'secretsmanager:GetSecretValue'
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

    const clusterIdentifier = getSecretManagerInstance.secretValueFromJson('cluster_identifier')
    const databaseName = getSecretManagerInstance.secretValueFromJson('database_name')
    

    const auroraDataSource = new CfnDataSource(this, 'AuroraDBDataSource', {
      apiId: graphAPI.attrApiId,
      name: 'auroraDataSource',
      type: 'RELATIONAL_DATABASE',
      relationalDatabaseConfig: {
        relationalDatabaseSourceType: 'RDS_HTTP_ENDPOINT',
        rdsHttpEndpointConfig: {
          awsRegion: this.region,
          awsSecretStoreArn: getSecretManagerInstance.secretArn,
          dbClusterIdentifier: clusterIdentifier.unsafeUnwrap.toString(),
          schema: 'public',
          databaseName: databaseName.unsafeUnwrap.toString(),
        }
      },
      serviceRoleArn: appsyncAuroraRole.roleArn
    });


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

    const domainResolver = new CfnResolver(this, 
      'AuroraResolver', 
      {
        apiId: graphAPI.attrApiId,
        typeName: 'Query',
        fieldName: 'getDomainVerification',
        dataSourceName: auroraDataSource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.Domain.req.vtl"
        ).toString(),
        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.Domain.res.vtl"
        ).toString()
    });


    recaptchaValidationResolver.addDependsOn(apiSchema)

    classificationSummaryResolver.addDependsOn(apiSchema);
    
    //indicatorPerAreaResolver.addDependsOn(openSearchDataSource);
    domainResolver.addDependsOn(apiSchema);
   
  }
}
