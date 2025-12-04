import { Construct } from 'constructs';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';


export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create DynamoDB table with updated schema for Lambda architecture
    const jobsTable = new dynamodb.Table(this, 'JobsTable', {
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change for production
    });

    // Create S3 bucket for document uploads
    const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      bucketName: cdk.Fn.join('-', ['ai-underwriting', cdk.Aws.ACCOUNT_ID, 'landing']),
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change for production
      autoDeleteObjects: true,
      versioned: true,
      eventBridgeEnabled: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.GET,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'], // This will be replaced by CloudFront domain in production
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000
        },
      ],
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30), // Auto-delete files after 30 days
        },
      ],
    });

    // Create S3 bucket to store extraction chunks
    const extractionBucket = new s3.Bucket(this, 'ExtractionBucket', {
      bucketName: cdk.Fn.join('-', ['ai-underwriting', cdk.Aws.ACCOUNT_ID, 'extraction-chunks']),
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change for production
      autoDeleteObjects: true,
      versioned: true,
      eventBridgeEnabled: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.GET,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'], // This will be replaced by CloudFront domain in production
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000
        },
      ],
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30), // Auto-delete files after 30 days
        },
      ],
    });


    // Create S3 bucket for mock output files
    const mockOutputBucket = new s3.Bucket(this, 'MockOutputBucket', {
      bucketName: cdk.Fn.join('-', ['ai-underwriting', cdk.Aws.ACCOUNT_ID, 'mock-output']),
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change for production
      autoDeleteObjects: true,
    });

    // Create S3 bucket for archived jobs
    const archiveBucket = new s3.Bucket(this, 'ArchiveBucket', {
      bucketName: cdk.Fn.join('-', ['ai-underwriting', cdk.Aws.ACCOUNT_ID, 'archive']),
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change for production
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90), // Auto-delete archived jobs after 90 days
        },
      ],
    });

    // Create Lambda Layers
    const pillowLayer = new lambda.LayerVersion(this, 'PillowLayer', {
      code: lambda.Code.fromAsset('lambda-layers/pillow-py312.zip'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'Image processing libaries for downsizing',
    });

    const pdfProcessingLayer = new lambda.LayerVersion(this, 'PdfProcessingLayer', {
      code: lambda.Code.fromAsset('lambda-layers/pdf-tools-py312.zip'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'PDF processing libraries like pdf2image and dependencies',
    });

    const boto3Layer = new lambda.LayerVersion(this, 'Boto3Layer', {
      code: lambda.Code.fromAsset('lambda-layers/boto3_lambda_layer.zip'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'AWS SDK for Python (Boto3) and dependencies',
    });

    const strandsSDKLayer = new lambda.LayerVersion(this, 'StrandsSDKLayer', {
      code: lambda.Code.fromAsset('lambda-layers/strands-sdk-py312.zip'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'Strands Agents SDK and dependencies',
    });

    // Create common IAM policy statements for Lambda functions
    const bedrockPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
        'bedrock:InvokeModel',
        'bedrock:ListFoundationModels',
        'bedrock:InvokeModelWithResponseStream'
      ],
    });

    const dynamodbPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [
        jobsTable.tableArn,
        `${jobsTable.tableArn}/index/*`,
      ],
      actions: [
        'dynamodb:PutItem',
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
        'dynamodb:BatchWriteItem'
      ],
    });

    const s3PolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [
        documentBucket.arnForObjects('*'),
        documentBucket.bucketArn,
        extractionBucket.arnForObjects('*'),
        extractionBucket.bucketArn,
        mockOutputBucket.arnForObjects('*'),
        mockOutputBucket.bucketArn,
        archiveBucket.arnForObjects('*'),
        archiveBucket.bucketArn
      ],
      actions: [
        's3:PutObject',
        's3:GetObject',
        's3:DeleteObject',
        's3:ListBucket'
      ],
    });

    // Create Lambda Functions

    // 1. API Handler Lambda
    const apiHandlerLambda = new lambda.Function(this, 'ApiHandlerLambda', {
      functionName: 'ai-underwriting-api-handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda-functions/api-handler'),
      handler: 'index.lambda_handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        DOCUMENT_BUCKET: documentBucket.bucketName,
        EXTRACTION_BUCKET: extractionBucket.bucketName,
        JOBS_TABLE_NAME: jobsTable.tableName,
        // STATE_MACHINE_ARN will be added later
      },
      layers: [boto3Layer],
    });

    // 2. Classify Lambda
    const classifyLambda = new lambda.Function(this, 'ClassifyLambda', {
      functionName: 'ai-underwriting-classify',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda-functions/classify'),
      handler: 'index.lambda_handler',
      timeout: cdk.Duration.minutes(3),
      memorySize: 1024,
      environment: {
        BEDROCK_MODEL_ID: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        JOBS_TABLE_NAME: jobsTable.tableName,
      },
      layers: [pdfProcessingLayer, boto3Layer],
    });

    // 3. Batch Page Lambda
    const batchGeneratorLambda = new lambda.Function(this, 'BatchGeneratorLambda', {
      functionName: 'ai-underwriting-batch-generator',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda-functions/batch-generator'),
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(1),
      memorySize: 1024,
      layers: [pdfProcessingLayer],
      environment: {
        BATCH_SIZE: '1',
      },
    });

    // 4. Bedrock Extract Lambda
    const bedrockExtractLambda = new lambda.Function(this, 'BedrockExtractLambda', {
      functionName: 'ai-underwriting-bedrock-extract',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda-functions/bedrock-extract'),
      handler: 'index.lambda_handler',
      timeout: cdk.Duration.minutes(10),
      memorySize: 2048,
      environment: {
        BEDROCK_MODEL_ID: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        JOBS_TABLE_NAME: jobsTable.tableName,
        MAX_PAGES_FOR_EXTRACTION: '5',
        EXTRACTION_BUCKET: extractionBucket.bucketName
      },
      layers: [pillowLayer, pdfProcessingLayer, boto3Layer],
    });

    // 5. Analyze Lambda
    const analyzeLambda = new lambda.Function(this, 'AnalyzeLambda', {
      functionName: 'ai-underwriting-analyze',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda-functions/analyze'),
      handler: 'index.lambda_handler',
      timeout: cdk.Duration.minutes(5),
      ephemeralStorageSize: cdk.Size.gibibytes(2),
      memorySize: 512,
      environment: {
        BEDROCK_ANALYSIS_MODEL_ID: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        JOBS_TABLE_NAME: jobsTable.tableName,
        EXTRACTION_BUCKET: extractionBucket.bucketName
      },
      layers: [boto3Layer],
    });

    // 6. Act Lambda
    const actLambda = new lambda.Function(this, 'ActLambda', {
      functionName: 'ai-underwriting-act',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda-functions/act'),
      handler: 'index.lambda_handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        MOCK_OUTPUT_S3_BUCKET: mockOutputBucket.bucketName,
        JOBS_TABLE_NAME: jobsTable.tableName,
      },
      layers: [strandsSDKLayer, boto3Layer],
    });

    // 7. Chat Lambda
    const chatLambda = new lambda.Function(this, 'ChatLambda', {
      functionName: 'ai-underwriting-chat',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda-functions/chat'),
      handler: 'index.lambda_handler',
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      environment: {
        BEDROCK_CHAT_MODEL_ID: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        JOBS_TABLE_NAME: jobsTable.tableName,
      },
      layers: [boto3Layer],
    });

    // 8. Cleanup Lambda - Archives and deletes old completed jobs
    const cleanupLambda = new lambda.Function(this, 'CleanupLambda', {
      functionName: 'ai-underwriting-cleanup-jobs',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda-functions/cleanup-jobs'),
      handler: 'index.lambda_handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        JOBS_TABLE_NAME: jobsTable.tableName,
        ARCHIVE_BUCKET: archiveBucket.bucketName,
        RETENTION_DAYS: '7', // Archive jobs older than 7 days
      },
      layers: [boto3Layer],
    });

    // Add permissions to Lambda functions
    apiHandlerLambda.addToRolePolicy(dynamodbPolicyStatement);
    apiHandlerLambda.addToRolePolicy(s3PolicyStatement);

    classifyLambda.addToRolePolicy(bedrockPolicyStatement);
    classifyLambda.addToRolePolicy(dynamodbPolicyStatement);
    classifyLambda.addToRolePolicy(s3PolicyStatement);

    batchGeneratorLambda.addToRolePolicy(s3PolicyStatement);
    batchGeneratorLambda.addToRolePolicy(dynamodbPolicyStatement);
    batchGeneratorLambda.addToRolePolicy(bedrockPolicyStatement);

    bedrockExtractLambda.addToRolePolicy(bedrockPolicyStatement);
    bedrockExtractLambda.addToRolePolicy(dynamodbPolicyStatement);
    bedrockExtractLambda.addToRolePolicy(s3PolicyStatement);

    analyzeLambda.addToRolePolicy(bedrockPolicyStatement);
    analyzeLambda.addToRolePolicy(dynamodbPolicyStatement);
    analyzeLambda.addToRolePolicy(s3PolicyStatement);

    actLambda.addToRolePolicy(bedrockPolicyStatement);
    actLambda.addToRolePolicy(dynamodbPolicyStatement);
    actLambda.addToRolePolicy(s3PolicyStatement);

    chatLambda.addToRolePolicy(bedrockPolicyStatement);
    chatLambda.addToRolePolicy(dynamodbPolicyStatement);

    cleanupLambda.addToRolePolicy(dynamodbPolicyStatement);
    cleanupLambda.addToRolePolicy(s3PolicyStatement);

    // Schedule cleanup Lambda to run daily at 2 AM UTC
    const cleanupRule = new events.Rule(this, 'CleanupScheduleRule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '2' }),
      description: 'Trigger cleanup Lambda daily to archive and delete old jobs',
    });
    cleanupRule.addTarget(new eventTargets.LambdaFunction(cleanupLambda));

    // Create Step Functions State Machine
    const classifyStep = new stepfunctionsTasks.LambdaInvoke(this, 'ClassifyDocument', {
      lambdaFunction: classifyLambda,
      resultPath: '$.classification',
      payloadResponseOnly: true,
    });

    const generateBatchesStep = new stepfunctionsTasks.LambdaInvoke(this, 'GenerateBatches', {
      lambdaFunction: batchGeneratorLambda,
      // pass through the bucket/key and classification info
      payload: stepfunctions.TaskInput.fromObject({
        detail: {
          bucket: stepfunctions.JsonPath.stringAt('$.detail.bucket.name'),
          object: { key: stepfunctions.JsonPath.stringAt('$.detail.object.key') }
        },
        classification: stepfunctions.JsonPath.stringAt('$.classification')
      }),
      resultPath: '$.batches',
      payloadResponseOnly: true,
    });

    const parallelExtract = new stepfunctions.Map(this, 'ParallelExtraction', {
      itemsPath: '$.batches.batchRanges',
      resultPath: '$.extractionResults',
      maxConcurrency: 1,  // Set to 1 for Bedrock quota handling when processing multiple files
      itemSelector: {
        'detail.$': '$.detail',
        'classification.$': '$.classification',
        'pages.$': '$$.Map.Item.Value',
      }
    });

    const extractTask = new stepfunctionsTasks.LambdaInvoke(this, 'ExtractWithBedrock', {
      lambdaFunction: bedrockExtractLambda,
      payloadResponseOnly: true,
      resultSelector: {
        'pages.$': '$.pages',
        'chunkS3Key.$': '$.chunkS3Key'
      },
      resultPath: '$',
    });

    parallelExtract.itemProcessor(extractTask);

    const analyzeStep = new stepfunctionsTasks.LambdaInvoke(this, 'AnalyzeData', {
      lambdaFunction: analyzeLambda,
      resultPath: '$.analysis',
      payloadResponseOnly: true,
    });

    const actStep = new stepfunctionsTasks.LambdaInvoke(this, 'TakeAction', {
      lambdaFunction: actLambda,
      payloadResponseOnly: true,
    });

    classifyStep
      .next(generateBatchesStep)
      .next(parallelExtract)
      .next(analyzeStep)
      .next(actStep);

    // Create a log group for the state machine
    const logGroup = new logs.LogGroup(this, 'DocumentProcessingLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const stateMachine = new stepfunctions.StateMachine(this, 'DocumentProcessingWorkflow', {
      stateMachineName: 'ai-underwriting-workflow',
      definitionBody: stepfunctions.DefinitionBody.fromChainable(classifyStep),
      timeout: cdk.Duration.minutes(60),
      // Add logging configuration
      logs: {
        destination: logGroup,
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true,
      },
      // Enable X-Ray tracing
      tracingEnabled: true,
    });

    // Update ApiHandlerLambda with the state machine ARN
    apiHandlerLambda.addEnvironment('STATE_MACHINE_ARN', stateMachine.stateMachineArn);

    // ========================================
    // PRIMARY SOLUTION: S3 Event Notification → Trigger Lambda → Step Functions
    // ========================================

    // Create Lambda to trigger Step Functions workflow
    const triggerWorkflowLambda = new lambda.Function(this, 'TriggerWorkflowLambda', {
      functionName: 'ai-underwriting-trigger-workflow',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda-functions/trigger-workflow'),
      handler: 'index.lambda_handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
      },
      layers: [boto3Layer],
      description: 'Triggers Step Functions workflow when PDFs are uploaded to S3',
    });

    // Grant permission to start Step Functions executions
    stateMachine.grantStartExecution(triggerWorkflowLambda);

    // Add S3 event notification to trigger the Lambda
    documentBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(triggerWorkflowLambda),
      { prefix: 'uploads/', suffix: '.pdf' }
    );

    // ========================================
    // DIAGNOSTIC: EventBridge Rule (Disabled, for debugging)
    // ========================================

    // Create CloudWatch Logs for EventBridge debugging
    const eventBridgeLogGroup = new logs.LogGroup(this, 'EventBridgeLogGroup', {
      logGroupName: '/aws/events/s3-upload-rule',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create EventBridge Rule (disabled, kept for debugging)
    const rule = new events.Rule(this, 'S3UploadRule', {
      ruleName: 'ai-underwriting-s3-upload-eventbridge',
      description: 'EventBridge rule for S3 uploads (disabled - using S3 notifications instead)',
      enabled: false,  // Disabled - using S3 event notifications instead
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [documentBucket.bucketName],
          },
          object: {
            key: [{ prefix: 'uploads/' }],
            size: [{ numeric: ['>', 0] }],
          },
        },
      },
    });

    // Add CloudWatch Logs as target for debugging (even when disabled)
    rule.addTarget(new eventTargets.CloudWatchLogGroup(eventBridgeLogGroup));

    // Add EventBridge rule target with input transformer (for when we re-enable it)
    rule.addTarget(new eventTargets.SfnStateMachine(stateMachine, {
      input: events.RuleTargetInput.fromObject({
        detail: {
          bucket: {
            name: events.EventField.fromPath('$.detail.bucket.name'),
          },
          object: {
            key: events.EventField.fromPath('$.detail.object.key'),
          },
        },
        classification: 'OTHER'
      }),
    }));

    // ========================================
    // MONITORING: CloudWatch Alarms
    // ========================================

    // Add CloudWatch alarm for failed Step Functions executions
    const failedExecutionsAlarm = new cloudwatch.Alarm(this, 'FailedExecutionsAlarm', {
      alarmName: 'ai-underwriting-workflow-failures',
      alarmDescription: 'Alert when Step Functions workflow execution fails',
      metric: stateMachine.metricFailed({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add CloudWatch alarm for trigger Lambda errors
    const triggerLambdaErrorAlarm = new cloudwatch.Alarm(this, 'TriggerLambdaErrorAlarm', {
      alarmName: 'ai-underwriting-trigger-lambda-errors',
      alarmDescription: 'Alert when trigger Lambda function encounters errors',
      metric: triggerWorkflowLambda.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });


    // Create access logs for API Gateway
    const apiAccessLogGroup = new logs.LogGroup(this, 'ApiAccessLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create CloudWatch Logs role for API Gateway
    const apiGatewayCloudWatchRole = new iam.Role(this, 'ApiGatewayCloudWatchRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs')
      ],
    });

    // Grant API Gateway CloudWatch Logs permissions
    new apigateway.CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: apiGatewayCloudWatchRole.roleArn,
    });

    // Add suppression for API Gateway CloudWatch role using AWS managed policy
    NagSuppressions.addResourceSuppressions(apiGatewayCloudWatchRole, [{
      id: 'AwsSolutions-IAM4',
      reason: 'API Gateway requires AWS managed policy for CloudWatch Logs access.',
    }]);

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'UnderwritingApi', {
      restApiName: 'ai-underwriting-api',
      description: 'API for the AI Underwriting Assistant',
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      // Configure CORS at the API level
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
        maxAge: cdk.Duration.days(1),
      },
      // Enable request validation
      deployOptions: {
        accessLogDestination: new apigateway.LogGroupLogDestination(apiAccessLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
    });

    // Create API Gateway Resources following the /api/... pattern
    const apiResource = api.root.addResource('api');

    // Documents resources
    const documentsResource = apiResource.addResource('documents');
    const uploadResource = documentsResource.addResource('upload');
    const batchUploadResource = documentsResource.addResource('batch-upload');
    const statusParentResource = documentsResource.addResource('status');
    const statusResource = statusParentResource.addResource('{executionArn}');

    // Jobs resources
    const jobsResource = apiResource.addResource('jobs');
    const jobByIdResource = jobsResource.addResource('{jobId}');
    const documentUrlResource = jobByIdResource.addResource('document-url');

    // Chat resources
    const chatResource = apiResource.addResource('chat');
    const chatByJobIdResource = chatResource.addResource('{jobId}');

    // Add methods to resources
    const apiHandlerIntegration = new apigateway.LambdaIntegration(apiHandlerLambda);
    const chatLambdaIntegration = new apigateway.LambdaIntegration(chatLambda);

    // Jobs and upload endpoints
    jobsResource.addMethod('GET', apiHandlerIntegration);
    jobByIdResource.addMethod('GET', apiHandlerIntegration);
    documentUrlResource.addMethod('GET', apiHandlerIntegration);
    uploadResource.addMethod('POST', apiHandlerIntegration);
    batchUploadResource.addMethod('POST', apiHandlerIntegration);
    statusResource.addMethod('GET', apiHandlerIntegration);
    chatByJobIdResource.addMethod('POST', chatLambdaIntegration);

    // Create S3 bucket for frontend
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    // Create CloudFront OAI
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI');
    websiteBucket.grantRead(originAccessIdentity);

    // Create IP set for CloudFront distribution
    const whitelistIpSet = new wafv2.CfnIPSet(this, 'WhitelistIPSet', {
      name: 'WhitelistIPSet',
      scope: 'CLOUDFRONT',
      ipAddressVersion: 'IPV4',
      addresses: []
    });

    // Create WAFv2 Web ACL for CloudFront distribution
    const webAcl = new wafv2.CfnWebACL(this, 'WhitelistIPSetWebAcl', {
      name: 'WhitelistIPSetWebAcl',
      scope: 'CLOUDFRONT',
      defaultAction: {
        allow: {}
      },
      rules: [
        {
          name: 'AllowWhitelistIPSetRule',
          priority: 1,
          statement: {
            ipSetReferenceStatement: {
              arn: whitelistIpSet.attrArn,
            }
          },
          action: {
            allow: {}
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AllowWhitelistIPSetRule',
          }
        }
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'CloudFrontWebAcl',
      },
    });


    // Create CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(websiteBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      webAclId: webAcl.attrArn,
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Deploy frontend to S3
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend'), {
        bundling: {
          command: [
            '/bin/sh',
            '-c',
            'npm install && npm run build && cp -r dist/. /asset-output/'
          ],
          image: cdk.DockerImage.fromRegistry('node:20'),
          user: 'root',
        },
      })],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Add Nag Suppression for API Handler Lambda
    // This is to suppress the warning for using wildcard permissions in development
    // In production, this should be restricted to specific resources
    NagSuppressions.addResourceSuppressions(apiHandlerLambda, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Using wildcard for simplicity in development. Will be restricted in production.',
      },
    ]);

    // Add Nag Suppression for Amazon S3 Buckets
    NagSuppressions.addResourceSuppressions(documentBucket, [{
      id: 'AwsSolutions-S3-1',
      reason: 'Using wildcard for simplicity in development. Will be restricted in production.',
    }, {
      id: 'AwsSolutions-S1',
      reason: 'S3 bucket server access logging is not enabled for development. Will be enabled in production.',
    }, {
      id: 'AwsSolutions-S10',
      reason: 'S3 bucket or bucket policy does not require SSL requests. This is for development purposes. Will be enforced in production.',
    }]);
    NagSuppressions.addResourceSuppressions(mockOutputBucket, [{
      id: 'AwsSolutions-S3-1',
      reason: 'Using wildcard for simplicity in development. Will be restricted in production.',
    }, {
      id: 'AwsSolutions-S1',
      reason: 'S3 bucket server access logging is not enabled for development. Will be enabled in production.',
    }, {
      id: 'AwsSolutions-S10',
      reason: 'S3 bucket or bucket policy does not require SSL requests. This is for development purposes. Will be enforced in production.',
    }]);
    NagSuppressions.addResourceSuppressions(archiveBucket, [{
      id: 'AwsSolutions-S3-1',
      reason: 'Using wildcard for simplicity in development. Will be restricted in production.',
    }, {
      id: 'AwsSolutions-S1',
      reason: 'S3 bucket server access logging is not enabled for development. Will be enabled in production.',
    }, {
      id: 'AwsSolutions-S10',
      reason: 'S3 bucket or bucket policy does not require SSL requests. This is for development purposes. Will be enforced in production.',
    }]);
    NagSuppressions.addResourceSuppressions(extractionBucket, [{
      id: 'AwsSolutions-S3-1',
      reason: 'Using wildcard for simplicity in development. Will be restricted in production.',
    }, {
      id: 'AwsSolutions-S1',
      reason: 'S3 bucket server access logging is not enabled for development. Will be enabled in production.',
    }, {
      id: 'AwsSolutions-S10',
      reason: 'S3 bucket or bucket policy does not require SSL requests. This is for development purposes. Will be enforced in production.',
    }]);
    NagSuppressions.addResourceSuppressions(websiteBucket, [{
      id: 'AwsSolutions-S3-1',
      reason: 'Using wildcard for simplicity in development. Will be restricted in production.',
    }, {
      id: 'AwsSolutions-S1',
      reason: 'S3 bucket server access logging is not enabled for development. Will be enabled in production.',
    }, {
      id: 'AwsSolutions-S10',
      reason: 'S3 bucket or bucket policy does not require SSL requests. This is for development purposes. Will be enforced in production.',
    }]);

    // Add specific suppression for DocumentBucket Policy Resource
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/DocumentBucket/Policy/Resource', [{
      id: 'AwsSolutions-S10',
      reason: 'S3 bucket policy does not require SSL requests. This is for development purposes. Will be enforced in production.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ExtractionBucket/Policy/Resource', [{
      id: 'AwsSolutions-S10',
      reason: 'S3 bucket policy does not require SSL requests. This is for development purposes. Will be enforced in production.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/MockOutputBucket/Policy/Resource', [{
      id: 'AwsSolutions-S10',
      reason: 'S3 bucket policy does not require SSL requests. This is for development purposes. Will be enforced in production.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ArchiveBucket/Policy/Resource', [{
      id: 'AwsSolutions-S10',
      reason: 'S3 bucket policy does not require SSL requests. This is for development purposes. Will be enforced in production.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/WebsiteBucket/Policy/Resource', [{
      id: 'AwsSolutions-S10',
      reason: 'S3 bucket policy does not require SSL requests. This is for development purposes. Will be enforced in production.',
    }]);

    // Add Nag Suppression for DynamoDB Table
    NagSuppressions.addResourceSuppressions(jobsTable, [{
      id: 'AwsSolutions-DDB1',
      reason: 'Using default partition key for simplicity in development. Will be updated in production.',
    }, {
      id: 'AwsSolutions-DDB2',
      reason: 'DynamoDB table does not have point-in-time recovery enabled for development. Will be enabled in production.',
    }, {
      id: 'AwsSolutions-DDB3',
      reason: 'DynamoDB table does not have point-in-time recovery enabled for development. Will be enabled in production.',
    }]);

    // Add Nag Suppression for BucketNotificationsHandler (CDK-generated resource)
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/BucketNotificationsHandler050a0587b7544547bf325f094a3db834/Role/Resource', [{
      id: 'AwsSolutions-IAM4',
      reason: 'CDK-generated BucketNotificationsHandler uses AWS managed policy for Lambda basic execution. This is acceptable for the notification handler.',
    }]);

    // Add Nag Suppression for BucketNotificationsHandler DefaultPolicy
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/BucketNotificationsHandler050a0587b7544547bf325f094a3db834/Role/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'CDK-generated BucketNotificationsHandler uses wildcard permissions for S3 notifications. This is a CDK implementation detail that cannot be modified.',
    }]);

    // Add suppression for Lambda using AWS managed policy
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ApiHandlerLambda/ServiceRole/Resource', [{
      id: 'AwsSolutions-IAM4',
      reason: 'Lambda requires basic execution role for CloudWatch Logs access. This is acceptable for this demo.',
    },]);

    // Add suppression for ApiHandlerLambda DefaultPolicy wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ApiHandlerLambda/ServiceRole/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Lambda needs access to DynamoDB table indexes. This is acceptable for this demo.',
    }]);

    // Add suppression for ApiHandlerLambda DefaultPolicy wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ApiHandlerLambda/ServiceRole/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Lambda needs access to DynamoDB table indexes and S3 bucket objects. This is acceptable for this demo.',
    }]);

    // Keep only this one with the more comprehensive reason
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ApiHandlerLambda/ServiceRole/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Lambda needs access to DynamoDB table indexes and S3 bucket objects. This is acceptable for this demo.',
    }]);

    // Add suppression for Lambda functions not using latest runtime
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ApiHandlerLambda/Resource', [{
      id: 'AwsSolutions-L1',
      reason: 'Using Python 3.12 which is the latest available runtime for this project.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ClassifyLambda/Resource', [{
      id: 'AwsSolutions-L1',
      reason: 'Using Python 3.12 which is the latest available runtime for this project.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/BedrockExtractLambda/Resource', [{
      id: 'AwsSolutions-L1',
      reason: 'Using Python 3.12 which is the latest available runtime for this project.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/AnalyzeLambda/Resource', [{
      id: 'AwsSolutions-L1',
      reason: 'Using Python 3.12 which is the latest available runtime for this project.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ActLambda/Resource', [{
      id: 'AwsSolutions-L1',
      reason: 'Using Python 3.12 which is the latest available runtime for this project.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ChatLambda/Resource', [{
      id: 'AwsSolutions-L1',
      reason: 'Using Python 3.12 which is the latest available runtime for this project.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/CleanupLambda/Resource', [{
      id: 'AwsSolutions-L1',
      reason: 'Using Python 3.12 which is the latest available runtime for this project.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/BatchGeneratorLambda/Resource', [
      {
        id: 'AwsSolutions-L1',
        reason: 'Using Python 3.12 which is the latest available runtime for this project.',
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/TriggerWorkflowLambda/Resource', [{
      id: 'AwsSolutions-L1',
      reason: 'Using Python 3.12 which is the latest available runtime for this project.',
    }]);


    // Add suppression for Lambda functions using AWS managed policy
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ClassifyLambda/ServiceRole/Resource', [{
      id: 'AwsSolutions-IAM4',
      reason: 'Lambda requires basic execution role for CloudWatch Logs access. This is acceptable for this demo.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/BedrockExtractLambda/ServiceRole/Resource', [{
      id: 'AwsSolutions-IAM4',
      reason: 'Lambda requires basic execution role for CloudWatch Logs access. This is acceptable for this demo.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/AnalyzeLambda/ServiceRole/Resource', [{
      id: 'AwsSolutions-IAM4',
      reason: 'Lambda requires basic execution role for CloudWatch Logs access. This is acceptable for this demo.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ActLambda/ServiceRole/Resource', [{
      id: 'AwsSolutions-IAM4',
      reason: 'Lambda requires basic execution role for CloudWatch Logs access. This is acceptable for this demo.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ChatLambda/ServiceRole/Resource', [{
      id: 'AwsSolutions-IAM4',
      reason: 'Lambda requires basic execution role for CloudWatch Logs access. This is acceptable for this demo.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/BatchGeneratorLambda/ServiceRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Lambda requires basic execution role for CloudWatch Logs access. This is acceptable for this demo.',
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/TriggerWorkflowLambda/ServiceRole/Resource', [{
      id: 'AwsSolutions-IAM4',
      reason: 'Lambda requires basic execution role for CloudWatch Logs access. This is acceptable for this demo.',
    }]);



    // Add suppression for Lambda function DefaultPolicy wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ClassifyLambda/ServiceRole/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Lambda needs access to Bedrock, DynamoDB table indexes and S3 bucket objects. This is acceptable for this demo.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/BedrockExtractLambda/ServiceRole/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Lambda needs access to Bedrock, DynamoDB table indexes and S3 bucket objects. This is acceptable for this demo.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/AnalyzeLambda/ServiceRole/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Lambda needs access to Bedrock and DynamoDB table indexes. This is acceptable for this demo.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ActLambda/ServiceRole/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Lambda needs access to Bedrock, DynamoDB table indexes and S3 bucket objects. This is acceptable for this demo.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/ChatLambda/ServiceRole/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Lambda needs access to Bedrock and DynamoDB table indexes. This is acceptable for this demo.',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/BatchGeneratorLambda/ServiceRole/DefaultPolicy/Resource', [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Lambda needs access to Bedrock, DynamoDB table indexes and S3 bucket objects. This is acceptable for this demo.',
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/TriggerWorkflowLambda/ServiceRole/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Lambda needs to start Step Functions executions. This is acceptable for this demo.',
    }]);


    // Add suppression for Step Function Role DefaultPolicy wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/DocumentProcessingWorkflow/Role/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Step Function needs to invoke Lambda functions. This is acceptable for this demo.',
    }]);

    // Add suppression for API Gateway warnings
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/UnderwritingApi/Resource', [{
      id: 'AwsSolutions-APIG2',
      reason: 'Request validation is not needed for this demo application.',
    }]);

    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/UnderwritingApi/DeploymentStage.prod/Resource', [{
      id: 'AwsSolutions-APIG1',
      reason: 'Access logging is already enabled through CloudWatch logs.',
    }]);

    // Add suppression for Step Function Role DefaultPolicy wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/DocumentProcessingWorkflow/Role/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Step Function needs to invoke Lambda functions. This is acceptable for this demo.',
    }]);

    // Add suppression for API Gateway warnings
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/UnderwritingApi/Resource', [{
      id: 'AwsSolutions-APIG2',
      reason: 'Request validation is not needed for this demo application.',
    }]);

    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/UnderwritingApi/DeploymentStage.prod/Resource', [{
      id: 'AwsSolutions-APIG1',
      reason: 'Access logging is already enabled through CloudWatch logs.',
    }, {
      id: 'AwsSolutions-APIG3',
      reason: 'WAF is not required for this demo application.',
    }]);

    // Add suppression for API Gateway methods not using authorization
    const apiMethodPaths = [
      '/AWS-GENAI-UW-DEMO/UnderwritingApi/Default/api/documents/upload/POST/Resource',
      '/AWS-GENAI-UW-DEMO/UnderwritingApi/Default/api/documents/batch-upload/POST/Resource',
      '/AWS-GENAI-UW-DEMO/UnderwritingApi/Default/api/documents/status/{executionArn}/GET/Resource',
      '/AWS-GENAI-UW-DEMO/UnderwritingApi/Default/api/jobs/{jobId}/document-url/GET/Resource',
      '/AWS-GENAI-UW-DEMO/UnderwritingApi/Default/api/jobs/{jobId}/GET/Resource',
      '/AWS-GENAI-UW-DEMO/UnderwritingApi/Default/api/jobs/GET/Resource',
      '/AWS-GENAI-UW-DEMO/UnderwritingApi/Default/api/chat/{jobId}/POST/Resource'
    ];

    apiMethodPaths.forEach(path => {
      NagSuppressions.addResourceSuppressionsByPath(this, path, [{
        id: 'AwsSolutions-APIG4',
        reason: 'API authorization is not implemented for this demo application.',
      }, {
        id: 'AwsSolutions-COG4',
        reason: 'Cognito user pool is not used for this demo application.',
      }]);
    });

    // Add suppression for Step Function Role DefaultPolicy wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/DocumentProcessingWorkflow/Role/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'Step Function needs to invoke Lambda functions. This is acceptable for this demo.',
    }]);

    // Add suppression for CloudFront distribution warnings
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/Distribution/Resource', [{
      id: 'AwsSolutions-CFR1',
      reason: 'Geo restrictions are not required for this demo application.',
    }, {
      id: 'AwsSolutions-CFR2',
      reason: 'WAF integration is not required for this demo application.',
    }, {
      id: 'AwsSolutions-CFR3',
      reason: 'Access logging is not enabled for development. Will be enabled in production.',
    }, {
      id: 'AwsSolutions-CFR4',
      reason: 'TLS version configuration is acceptable for this demo application.',
    }, {
      id: 'AwsSolutions-CFR7',
      reason: 'Using Origin Access Identity instead of Origin Access Control for this demo application.',
    }]);

    // Add suppression for CDK Bucket Deployment Lambda role
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/ServiceRole/Resource', [{
      id: 'AwsSolutions-IAM4',
      reason: 'CDK-generated BucketDeployment Lambda uses AWS managed policy for Lambda basic execution. This is acceptable for this demo.',
    }]);

    // Add suppression for CDK Bucket Deployment Lambda DefaultPolicy wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/ServiceRole/DefaultPolicy/Resource', [{
      id: 'AwsSolutions-IAM5',
      reason: 'CDK-generated BucketDeployment Lambda uses wildcard permissions for S3 operations. This is a CDK implementation detail that cannot be modified.',
    }]);

    // Add suppression for CDK Bucket Deployment Lambda runtime
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWS-GENAI-UW-DEMO/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/Resource', [{
      id: 'AwsSolutions-L1',
      reason: 'CDK-generated BucketDeployment Lambda runtime is managed by CDK and cannot be modified.',
    }]);

    // Output the CloudFront URL and other important resources
    new cdk.CfnOutput(this, 'FrontendURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Frontend URL',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint',
    });

    new cdk.CfnOutput(this, 'DocumentBucketName', {
      value: documentBucket.bucketName,
      description: 'S3 Bucket for document uploads',
    });

    new cdk.CfnOutput(this, 'ExtractionBucketName', {
      value: extractionBucket.bucketName,
      description: 'S3 Bucket for document uploads',
    });

    new cdk.CfnOutput(this, 'OutputBucketName', {
      value: mockOutputBucket.bucketName,
      description: 'S3 Bucket for agent action outputs',
    });

    new cdk.CfnOutput(this, 'JobsTableName', {
      value: jobsTable.tableName,
      description: 'DynamoDB table for job tracking',
    });

    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
      description: 'Step Functions state machine ARN',
    });
  }
}
